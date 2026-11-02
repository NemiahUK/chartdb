import { vi } from 'vitest';

export const files = new Map<string, string>();
export const stored = new Map<string, unknown>();
export const documents: MockDocument[] = [];
export const panels: MockPanel[] = [];
export const registered = new Map<string, () => Promise<void>>();
export const fileListeners: ((uri: Uri) => void)[] = [];
const disposable = { dispose() {} };
export class Uri {
    constructor(public path: string) {}
    static joinPath(base: Uri, ...parts: string[]) {
        return new Uri([base.path, ...parts].join('/'));
    }
    toString() {
        return this.path;
    }
    with({ path }: { path: string }) {
        return new Uri(path);
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
        public end: number
    ) {}
}
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
    registerCommand: (name: string, handler: () => Promise<void>) => {
        registered.set(name, handler);
        return disposable;
    },
};
export const ViewColumn = { Active: 1 };
export const context = {
    subscriptions: [],
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
