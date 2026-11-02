import * as vscode from 'vscode';
import { configSchema } from './config';

async function configuredFiles(folder: vscode.WorkspaceFolder) {
    try {
        const bytes = await vscode.workspace.fs.readFile(
            vscode.Uri.joinPath(folder.uri, '.chartdb.json')
        );
        const config = configSchema.parse(
            JSON.parse(new TextDecoder().decode(bytes))
        );
        return [
            vscode.Uri.joinPath(folder.uri, config.layout),
            vscode.Uri.joinPath(folder.uri, config.schema),
        ];
    } catch {
        // Missing/invalid configuration should not interrupt ordinary JSON editing.
        return undefined;
    }
}

export async function diagramFolder(uri: vscode.Uri) {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    if (!folder) return undefined;
    const files = await configuredFiles(folder);
    return files?.some((file) => file.toString() === uri.toString())
        ? folder
        : undefined;
}

export function registerLayoutActions(context: vscode.ExtensionContext) {
    const changed = new vscode.EventEmitter<void>();
    let generation = 0;
    let disposed = false;
    const refresh = async () => {
        const current = ++generation;
        const layouts = await Promise.all(
            (vscode.workspace.workspaceFolders ?? []).map(configuredFiles)
        );
        if (disposed || current !== generation) return;
        await vscode.commands.executeCommand(
            'setContext',
            'chartdb.diagramPaths',
            // VS Code's remote host sees file: URIs while the editor sees
            // vscode-remote: URIs. resourcePath deliberately ignores that
            // transport difference (uri.path remotely, uri.fsPath locally).
            [
                ...new Set(
                    layouts.flatMap((files) =>
                        (files ?? []).flatMap((uri) => [uri.path, uri.fsPath])
                    )
                ),
            ].filter(Boolean)
        );
        changed.fire();
    };
    const watcher =
        vscode.workspace.createFileSystemWatcher('**/.chartdb.json');
    context.subscriptions.push(
        changed,
        watcher,
        watcher.onDidChange(refresh),
        watcher.onDidCreate(refresh),
        watcher.onDidDelete(refresh),
        vscode.workspace.onDidChangeWorkspaceFolders(refresh),
        {
            dispose: () => {
                disposed = true;
                generation++;
            },
        },
        vscode.languages.registerCodeLensProvider(
            [{ pattern: '**/*.json' }, { pattern: '**/*.dbml' }],
            {
                onDidChangeCodeLenses: changed.event,
                async provideCodeLenses(document, token) {
                    if (!vscode.workspace.isTrusted) return [];
                    const folder = await diagramFolder(document.uri);
                    if (!folder || token.isCancellationRequested) return [];
                    return [
                        new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
                            title: 'Open in ChartDB',
                            tooltip:
                                'View the schema and edit its diagram layout',
                            command: 'chartdb.open',
                            arguments: [document.uri],
                        }),
                    ];
                },
            }
        )
    );
    void refresh();
}
