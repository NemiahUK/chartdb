import { vi } from 'vitest';

export const files = new Map<string, string>();
export const stored = new Map<string, unknown>();
export const documents: MockDocument[] = [];
export const panels: MockPanel[] = [];
export const registered = new Map<string, (uri?: Uri) => Promise<void>>();
export const fileListeners: ((uri: Uri) => void)[] = [];
const disposable = { dispose() {} };
export class Uri {
    constructor(
        public path: string,
        public scheme = 'file',
        public authority = ''
    ) {}
    get fsPath() {
        return this.path;
    }
    static joinPath(base: Uri, ...parts: string[]) {
        return new Uri(
            [base.path, ...parts].join('/'),
            base.scheme,
            base.authority
        );
    }
    toString() {
        return `${this.scheme}://${this.authority}${this.path}`;
    }
    with({ path }: { path: string }) {
        return new Uri(path, this.scheme, this.authority);
    }
}
export class FileSystemError extends Error {
    code = 'FileNotFound';
}
export class RelativePattern {
    constructor(
        public folder: unknown,
        public pattern: string
    ) {}
}
export class Range {
    constructor(
        public start: number,
        public end: number,
        public endLine?: number,
        public endCharacter?: number
    ) {}
}
export class EventEmitter<T> {
    event = vi.fn();
    fire = vi.fn<(value?: T) => void>();
    dispose() {}
}
export class CodeLens {
    constructor(
        public range: Range,
        public command: { title: string; command: string; arguments?: Uri[] }
    ) {}
}
export const lensProviders: {
    provideCodeLenses(
        document: { uri: Uri },
        token: { isCancellationRequested: boolean }
    ): Promise<CodeLens[]>;
}[] = [];
export const languages = {
    registerCodeLensProvider: vi.fn(
        (selector: unknown, provider: (typeof lensProviders)[number]) => {
            if (selector) lensProviders.push(provider);
            return disposable;
        }
    ),
};
export const contextKeys = new Map<string, unknown>();
export class WorkspaceEdit {
    operations: { uri: Uri; text: string; create?: boolean }[] = [];
    createFile(uri: Uri, options: { contents: Uint8Array }) {
        this.operations.push({
            uri,
            text: new TextDecoder().decode(options.contents),
            create: true,
        });
    }
    replace(uri: Uri, _range: Range, text: string) {
        this.operations.push({ uri, text });
    }
}
class MockDocument {
    isDirty = false;
    text: string;
    constructor(public uri: Uri) {
        this.text = files.get(uri.path)!;
    }
    getText() {
        return this.text;
    }
    positionAt(offset: number) {
        return offset;
    }
    async save() {
        files.set(this.uri.path, this.text);
        this.isDirty = false;
        return true;
    }
}
class MockPanel {
    title = '';
    receive?: (message: unknown) => void;
    disposed?: () => void;
    webview = {
        html: '',
        cspSource: 'https://webview.test',
        postMessage: vi.fn(async (message: unknown) => !!message),
        asWebviewUri: (uri: Uri) => uri,
        onDidReceiveMessage: (handler: (message: unknown) => void) => {
            this.receive = handler;
            return disposable;
        },
    };
    reveal() {}
    onDidDispose(handler: () => void) {
        this.disposed = handler;
        return disposable;
    }
    dispose() {
        this.disposed?.();
    }
}
export const workspace = {
    isTrusted: true,
    workspaceFolders: [{ name: 'fixture', uri: new Uri('/repo') }],
    textDocuments: documents,
    getWorkspaceFolder: (uri: Uri) =>
        workspace.workspaceFolders
            .filter((folder) => uri.path.startsWith(folder.uri.path + '/'))
            .sort((a, b) => b.uri.path.length - a.uri.path.length)[0],
    onDidChangeWorkspaceFolders: () => disposable,
    fs: {
        readFile: vi.fn(async (uri: Uri) => {
            const value = files.get(uri.path);
            if (value === undefined) throw new FileSystemError();
            return new TextEncoder().encode(value);
        }),
        createDirectory: vi.fn(async () => {}),
    },
    openTextDocument: async (uri: Uri) => {
        let document = documents.find((d) => d.uri.path === uri.path);
        if (!document) {
            document = new MockDocument(uri);
            documents.push(document);
        }
        return document;
    },
    applyEdit: vi.fn(async (edit: WorkspaceEdit) => {
        for (const operation of edit.operations) {
            if (operation.create) {
                if (files.has(operation.uri.path)) return false;
                files.set(operation.uri.path, operation.text);
            } else {
                const document = await workspace.openTextDocument(
                    operation.uri
                );
                document.text = operation.text;
                document.isDirty = true;
            }
        }
        return true;
    }),
    createFileSystemWatcher: () => ({
        ...disposable,
        onDidChange: (fn: (uri: Uri) => void) => {
            fileListeners.push(fn);
            return disposable;
        },
        onDidCreate: () => disposable,
        onDidDelete: () => disposable,
    }),
    onDidSaveTextDocument: () => disposable,
};
export const window = {
    activeTextEditor: undefined as { document: { uri: Uri } } | undefined,
    createWebviewPanel: () => {
        const panel = new MockPanel();
        panels.push(panel);
        return panel;
    },
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showWorkspaceFolderPick: vi.fn(),
};
export const commands = {
    executeCommand: vi.fn(
        async (command: string, key: string, value: unknown) => {
            if (command === 'setContext') contextKeys.set(key, value);
        }
    ),
    registerCommand: (name: string, handler: (uri?: Uri) => Promise<void>) => {
        registered.set(name, handler);
        return disposable;
    },
};
export const ViewColumn = { Active: 1 };
export const context = {
    subscriptions: [] as { dispose(): void }[],
    extensionUri: new Uri('/extension'),
    workspaceState: {
        get: (key: string) => stored.get(key),
        update: async (key: string, value: unknown) => {
            if (value === undefined) stored.delete(key);
            else stored.set(key, value);
        },
    },
};
export function reset() {
    for (const panel of panels) panel.dispose();
    for (const subscription of context.subscriptions) subscription.dispose();
    context.subscriptions.length = 0;
    lensProviders.length = 0;
    contextKeys.clear();
    workspace.workspaceFolders = [{ name: 'fixture', uri: new Uri('/repo') }];
    workspace.isTrusted = true;
    window.activeTextEditor = undefined;
    files.clear();
    stored.clear();
    documents.length = 0;
    panels.length = 0;
    fileListeners.length = 0;
    registered.clear();
    vi.clearAllMocks();
    files.set(
        '/extension/dist/webview/vscode.html',
        '<html><head></head><body><script src="./assets/main.js"></script></body></html>'
    );
}
