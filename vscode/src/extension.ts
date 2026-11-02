import * as vscode from 'vscode';
import { createHash, randomBytes } from 'node:crypto';
import { posix } from 'node:path';
import { configSchema } from './config';
import {
    emptyLayout,
    layoutFromExport,
    layoutSchema,
    serializeLayout,
} from '../../src/repository/layout';
import type {
    EditorMessage,
    HostMessage,
    RepositorySnapshot,
} from '../../src/repository/protocol';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const sessions = new Map<string, vscode.WebviewPanel>();
const hash = (data: string) => createHash('sha256').update(data).digest('hex');
const messageText = (error: unknown) =>
    error instanceof Error ? error.message : String(error);

async function readOptional(uri: vscode.Uri): Promise<string | undefined> {
    try {
        return decoder.decode(await vscode.workspace.fs.readFile(uri));
    } catch (error) {
        if (
            error instanceof vscode.FileSystemError &&
            error.code === 'FileNotFound'
        )
            return undefined;
        throw error;
    }
}

function escapeHtml(value: string) {
    return value.replace(
        /[&<>"']/g,
        (char) =>
            ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;',
            })[char]!
    );
}

async function webviewHtml(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri
) {
    const root = vscode.Uri.joinPath(extensionUri, 'dist', 'webview');
    const html = decoder.decode(
        await vscode.workspace.fs.readFile(
            vscode.Uri.joinPath(root, 'vscode.html')
        )
    );
    const nonce = randomBytes(24).toString('base64');
    const base = panel.webview.asWebviewUri(root).toString() + '/';
    // React Flow and Radix use inline style attributes. Script execution is restricted
    // to the packaged bundle. No external website, analytics or CDN is loaded.
    const policy = `default-src 'none'; img-src ${panel.webview.cspSource} data: blob:; style-src ${panel.webview.cspSource} 'unsafe-inline'; font-src ${panel.webview.cspSource}; script-src 'nonce-${nonce}' ${panel.webview.cspSource}; worker-src blob:; connect-src ${panel.webview.cspSource};`;
    return html
        .replace(
            '<head>',
            `<head><base href="${escapeHtml(base)}"><meta http-equiv="Content-Security-Policy" content="${escapeHtml(policy)}">`
        )
        .replace(/<script /g, `<script nonce="${nonce}" `);
}

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('chartdb.open', async () => {
            if (!vscode.workspace.isTrusted) return;
            const folders = vscode.workspace.workspaceFolders;
            if (!folders?.length) {
                await vscode.window.showInformationMessage(
                    'Open a repository folder containing .chartdb.json first.'
                );
                return;
            }
            const folder =
                folders.length === 1
                    ? folders[0]
                    : await vscode.window.showWorkspaceFolderPick();
            if (!folder) return;
            const key = folder.uri.toString();
            const existing = sessions.get(key);
            if (existing) {
                existing.reveal();
                return;
            }
            const configUri = vscode.Uri.joinPath(folder.uri, '.chartdb.json');
            if ((await readOptional(configUri)) === undefined) {
                await vscode.window.showInformationMessage(
                    'Add .chartdb.json to this repository. See the ChartDB Repository Diagrams extension README for an example.'
                );
                return;
            }
            const panel = vscode.window.createWebviewPanel(
                'chartdb.repository',
                'ChartDB',
                vscode.ViewColumn.Active,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [
                        vscode.Uri.joinPath(
                            context.extensionUri,
                            'dist',
                            'webview'
                        ),
                    ],
                }
            );
            sessions.set(key, panel);
            let disposed = false;
            let lastRevision: string | undefined;
            let tracked = new Set([configUri.toString()]);
            let queue = Promise.resolve();
            const recoveryKey = `chartdb.draft.${hash(key)}`;
            type Draft = Extract<EditorMessage, { type: 'draft' }>;
            let draft: Draft | undefined;
            let savedLayout = '';
            const knownRevisions = new Set<string>();
            const post = (message: HostMessage) => {
                if (!disposed) void panel.webview.postMessage(message);
            };
            const enqueue = (task: () => Promise<void>) => {
                queue = queue
                    .then(async () => {
                        await task();
                    })
                    .catch((error) => {
                        post({ type: 'error', message: messageText(error) });
                        if (disposed)
                            void vscode.window.showErrorMessage(
                                `ChartDB could not save the final layout: ${messageText(error)}. Reopen ChartDB to recover it.`
                            );
                    });
            };
            const dirty = (uri: vscode.Uri) =>
                vscode.workspace.textDocuments.some(
                    (doc) =>
                        doc.uri.toString() === uri.toString() && doc.isDirty
                );

            async function readSnapshot(): Promise<{
                snapshot: RepositorySnapshot;
                layoutUri: vscode.Uri;
                layoutText?: string;
                configText: string;
            }> {
                const configText = await readOptional(configUri);
                if (configText === undefined)
                    throw new Error(
                        '.chartdb.json was removed. Restore it and reload.'
                    );
                const config = configSchema.parse(JSON.parse(configText));
                const schemaUri = vscode.Uri.joinPath(
                    folder!.uri,
                    config.schema
                );
                const layoutUri = vscode.Uri.joinPath(
                    folder!.uri,
                    config.layout
                );
                const seedUri = config.importLayoutFrom
                    ? vscode.Uri.joinPath(folder!.uri, config.importLayoutFrom)
                    : undefined;
                tracked = new Set(
                    [
                        configUri,
                        schemaUri,
                        layoutUri,
                        ...(seedUri ? [seedUri] : []),
                    ].map((uri) => uri.toString())
                );
                if (dirty(configUri) || dirty(layoutUri))
                    throw new Error(
                        'Configuration or layout has unsaved text edits. Save or revert them, then reload ChartDB.'
                    );
                const dbml = await readOptional(schemaUri);
                if (dbml === undefined)
                    throw new Error(
                        `DBML file not found: ${config.schema}. Generate it, then reload.`
                    );
                const layoutText = await readOptional(layoutUri);
                const seedText =
                    layoutText === undefined && seedUri
                        ? await readOptional(seedUri)
                        : undefined;
                if (
                    layoutText === undefined &&
                    seedUri &&
                    seedText === undefined
                )
                    throw new Error(
                        `Existing export not found: ${config.importLayoutFrom}`
                    );
                const layout =
                    layoutText !== undefined
                        ? layoutSchema.parse(JSON.parse(layoutText))
                        : seedText !== undefined
                          ? layoutFromExport(JSON.parse(seedText))
                          : emptyLayout();
                return {
                    layoutUri,
                    layoutText,
                    configText,
                    snapshot: {
                        revision: hash(
                            JSON.stringify([
                                configText,
                                dbml,
                                layoutText ?? null,
                                seedText ?? null,
                            ])
                        ),
                        dbml,
                        layout,
                        name: config.name ?? folder!.name,
                        databaseType: config.databaseType,
                        sourcePath: config.schema,
                        layoutPath: config.layout,
                        needsInitialSave: layoutText === undefined,
                    },
                };
            }

            async function refresh(force = false, discard = false) {
                if (disposed) return;
                const { snapshot } = await readSnapshot();
                if (!force && lastRevision === snapshot.revision) return;
                lastRevision = snapshot.revision;
                knownRevisions.clear();
                knownRevisions.add(snapshot.revision);
                if (discard) {
                    draft = undefined;
                    await context.workspaceState.update(recoveryKey, undefined);
                }
                panel.title = `ChartDB: ${snapshot.name}`;
                post({ type: 'snapshot', snapshot, discard });
            }

            async function handle(message: EditorMessage) {
                if (message.type === 'draft') {
                    draft = message.dirty
                        ? {
                              ...message,
                              layout: layoutSchema.parse(message.layout),
                          }
                        : undefined;
                    return;
                }
                if (message.type === 'ready') {
                    const recovery =
                        context.workspaceState.get<Draft>(recoveryKey);
                    if (recovery) {
                        const answer = await vscode.window.showWarningMessage(
                            'ChartDB has an unsaved layout from the previous session. Recover it onto the current schema?',
                            { modal: true },
                            'Recover layout',
                            'Discard layout'
                        );
                        if (answer === undefined) return;
                        if (answer === 'Recover layout') {
                            const { snapshot } = await readSnapshot();
                            lastRevision = snapshot.revision;
                            knownRevisions.add(snapshot.revision);
                            post({
                                type: 'snapshot',
                                snapshot: {
                                    ...snapshot,
                                    layout: layoutSchema.parse(recovery.layout),
                                    needsInitialSave: true,
                                },
                            });
                            return;
                        }
                        await context.workspaceState.update(
                            recoveryKey,
                            undefined
                        );
                    }
                    await refresh(true);
                    return;
                }
                if (message.type === 'reload') {
                    if (message.dirty) {
                        const answer = await vscode.window.showWarningMessage(
                            'Reloading discards unsaved diagram layout changes.',
                            { modal: true },
                            'Reload'
                        );
                        if (answer !== 'Reload') return;
                    }
                    await refresh(true, true);
                    return;
                }
                if (message.type !== 'save') return;
                try {
                    const layout = layoutSchema.parse(message.layout);
                    const current = await readSnapshot();
                    if (message.revision !== current.snapshot.revision)
                        throw new Error(
                            'Repository files changed before saving. Reload to resolve the conflict; your files have not been overwritten.'
                        );
                    const content = serializeLayout(layout);
                    await vscode.workspace.fs.createDirectory(
                        current.layoutUri.with({
                            path: posix.dirname(current.layoutUri.path),
                        })
                    );
                    // Check again after asynchronous directory creation. Saves and file events
                    // are serialized, and dirty text buffers are never overwritten.
                    const verified = await readSnapshot();
                    if (verified.snapshot.revision !== message.revision)
                        throw new Error(
                            'Repository changed while saving. Reload to resolve the conflict.'
                        );
                    if (current.layoutText === undefined) {
                        const edit = new vscode.WorkspaceEdit();
                        edit.createFile(current.layoutUri, {
                            overwrite: false,
                            contents: encoder.encode(content),
                        });
                        if (!(await vscode.workspace.applyEdit(edit)))
                            throw new Error(
                                'Could not create the layout file. Reload and try again.'
                            );
                    } else {
                        const document =
                            await vscode.workspace.openTextDocument(
                                current.layoutUri
                            );
                        if (
                            document.isDirty ||
                            document.getText() !== current.layoutText
                        )
                            throw new Error(
                                'Layout was edited outside ChartDB. Save or revert those edits, then reload.'
                            );
                        const edit = new vscode.WorkspaceEdit();
                        edit.replace(
                            current.layoutUri,
                            new vscode.Range(
                                document.positionAt(0),
                                document.positionAt(document.getText().length)
                            ),
                            content
                        );
                        if (
                            !(await vscode.workspace.applyEdit(edit)) ||
                            !(await document.save())
                        )
                            throw new Error(
                                'Layout could not be saved. Check the file permissions and reload.'
                            );
                    }
                    const result = await readSnapshot();
                    if (result.layoutText !== content)
                        throw new Error(
                            'The layout changed during saving. Reload to review the current file.'
                        );
                    // Don't acknowledge schema/config changes that raced with the write as if
                    // the UI had already seen them: send a subsequent snapshot instead.
                    const expectedRevision = hash(
                        JSON.stringify([
                            current.configText,
                            current.snapshot.dbml,
                            content,
                            null,
                        ])
                    );
                    lastRevision = expectedRevision;
                    knownRevisions.add(expectedRevision);
                    savedLayout = content;
                    await context.workspaceState.update(recoveryKey, undefined);
                    post({
                        type: 'saved',
                        requestId: message.requestId,
                        revision: expectedRevision,
                    });
                    if (result.snapshot.revision !== expectedRevision)
                        await refresh(true);
                } catch (error) {
                    post({
                        type: 'error',
                        requestId: message.requestId,
                        message: messageText(error),
                    });
                    if (disposed)
                        void vscode.window.showErrorMessage(
                            `ChartDB could not save the final layout: ${messageText(error)}. Reopen ChartDB to recover it.`
                        );
                }
            }

            const watcher = vscode.workspace.createFileSystemWatcher(
                new vscode.RelativePattern(folder, '**/*')
            );
            const changed = (uri: vscode.Uri) => {
                if (tracked.has(uri.toString())) enqueue(() => refresh());
            };
            const subscriptions = [
                watcher,
                watcher.onDidChange(changed),
                watcher.onDidCreate(changed),
                watcher.onDidDelete(changed),
                vscode.workspace.onDidSaveTextDocument((doc) =>
                    changed(doc.uri)
                ),
                panel.webview.onDidReceiveMessage((message: EditorMessage) =>
                    enqueue(() => handle(message))
                ),
            ];
            panel.onDidDispose(() => {
                disposed = true;
                // The renderer sends drafts before its debounce. Flush the last one
                // even if the tab closes while an earlier write is still in flight.
                enqueue(async () => {
                    if (!draft || serializeLayout(draft.layout) === savedLayout)
                        return;
                    await context.workspaceState.update(recoveryKey, draft);
                    const current = await readSnapshot();
                    if (
                        current.snapshot.revision !== lastRevision ||
                        !knownRevisions.has(draft.revision)
                    ) {
                        void vscode.window.showWarningMessage(
                            'ChartDB kept your unsaved layout for recovery because repository files changed. Reopen ChartDB to recover it.'
                        );
                        return;
                    }
                    await handle({
                        ...draft,
                        type: 'save',
                        requestId: -1,
                        revision: current.snapshot.revision,
                    });
                });
                sessions.delete(key);
                for (const subscription of subscriptions)
                    subscription.dispose();
            });
            try {
                panel.webview.html = await webviewHtml(
                    panel,
                    context.extensionUri
                );
            } catch (error) {
                panel.dispose();
                await vscode.window.showErrorMessage(
                    `Cannot open ChartDB: ${messageText(error)}`
                );
            }
        })
    );
}
