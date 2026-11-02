import { beforeEach, describe, expect, it } from 'vitest';
import type { ExtensionContext } from 'vscode';
import manifest from '../package.json';
import { activate } from '../src/extension';
import * as mock from './vscode-mock';

const config = (layout: string) =>
    JSON.stringify({ version: 1, schema: 'schema.dbml', layout });
const tick = () => new Promise((resolve) => setTimeout(resolve, 20));
const lenses = (path: string, cancelled = false) =>
    mock.lensProviders[0].provideCodeLenses(
        { uri: new mock.Uri(path) },
        { isCancellationRequested: cancelled }
    );

beforeEach(async () => {
    mock.reset();
    mock.files.set('/repo/.chartdb.json', config('diagrams/layout.json'));
    activate(mock.context as unknown as ExtensionContext);
    await tick();
});

describe('layout editor actions', () => {
    it('shows a top-of-file action and toolbar context only for the configured layout', async () => {
        const actions = await lenses('/repo/diagrams/layout.json');
        expect(actions).toHaveLength(1);
        expect(actions[0].range.start).toBe(0);
        expect(actions[0].command).toMatchObject({
            title: 'Open in ChartDB',
            command: 'chartdb.open',
        });
        expect(actions[0].command.arguments![0].path).toBe(
            '/repo/diagrams/layout.json'
        );
        expect(mock.contextKeys.get('chartdb.diagramPaths')).toEqual([
            '/repo/diagrams/layout.json',
            '/repo/schema.dbml',
        ]);
        expect(await lenses('/repo/other/layout.json')).toEqual([]);
        expect(await lenses('/repo/.chartdb.json')).toEqual([]);
        expect(await lenses('/outside/layout.json')).toEqual([]);
        expect(await lenses('/repo/diagrams/layout.json', true)).toEqual([]);
    });

    it('updates when configuration changes, and tolerates invalid or missing config', async () => {
        mock.files.set('/repo/.chartdb.json', config('custom-name.json'));
        mock.fileListeners.forEach((listener) =>
            listener(new mock.Uri('/repo/.chartdb.json'))
        );
        await tick();
        expect(mock.contextKeys.get('chartdb.diagramPaths')).toEqual([
            '/repo/custom-name.json',
            '/repo/schema.dbml',
        ]);
        expect(await lenses('/repo/diagrams/layout.json')).toEqual([]);
        expect(await lenses('/repo/custom-name.json')).toHaveLength(1);
        mock.files.set('/repo/.chartdb.json', '{ invalid');
        mock.fileListeners.forEach((listener) =>
            listener(new mock.Uri('/repo/.chartdb.json'))
        );
        await tick();
        expect(mock.contextKeys.get('chartdb.diagramPaths')).toEqual([]);
        expect(await lenses('/repo/custom-name.json')).toEqual([]);
        mock.files.delete('/repo/.chartdb.json');
        expect(await lenses('/repo/custom-name.json')).toEqual([]);
    });

    it('opens the clicked file’s repository in a multi-root workspace and reuses its tab', async () => {
        mock.workspace.workspaceFolders.push({
            name: 'second',
            uri: new mock.Uri('/second'),
        });
        mock.files.set('/second/.chartdb.json', config('layout.json'));
        const uri = new mock.Uri('/second/layout.json');
        await mock.registered.get('chartdb.open')!(uri);
        expect(mock.panels).toHaveLength(1);
        expect(mock.window.showWorkspaceFolderPick).not.toHaveBeenCalled();
        await mock.registered.get('chartdb.open')!(uri);
        expect(mock.panels).toHaveLength(1);
    });

    it('uses the active layout for the command palette but rejects stale file actions', async () => {
        mock.workspace.workspaceFolders.push({
            name: 'second',
            uri: new mock.Uri('/second'),
        });
        mock.window.activeTextEditor = {
            document: { uri: new mock.Uri('/repo/diagrams/layout.json') },
        };
        await mock.registered.get('chartdb.open')!();
        expect(mock.panels).toHaveLength(1);
        expect(mock.window.showWorkspaceFolderPick).not.toHaveBeenCalled();
        await mock.registered.get('chartdb.open')!(
            new mock.Uri('/repo/unrelated.json')
        );
        expect(mock.panels).toHaveLength(1);
        expect(mock.window.showInformationMessage).toHaveBeenCalledWith(
            expect.stringContaining('not the layout or DBML source configured')
        );
    });

    it('does not offer or open the UI in an untrusted workspace', async () => {
        mock.workspace.isTrusted = false;
        expect(await lenses('/repo/diagrams/layout.json')).toEqual([]);
        await mock.registered.get('chartdb.open')!(
            new mock.Uri('/repo/diagrams/layout.json')
        );
        expect(mock.panels).toHaveLength(0);
    });
});

it('matches the Remote SSH editor path without requiring the remote host URI scheme', () => {
    expect(manifest.contributes.menus['editor/title']).toContainEqual(
        expect.objectContaining({
            command: 'chartdb.open',
            when: 'isWorkspaceTrusted && resourcePath in chartdb.diagramPaths',
        })
    );
    const hostFile = new mock.Uri('/repo/diagrams/layout.json');
    const editorFile = new mock.Uri(
        '/repo/diagrams/layout.json',
        'vscode-remote',
        'ssh-remote+server'
    );
    expect(editorFile.toString()).not.toBe(hostFile.toString());
    expect(mock.contextKeys.get('chartdb.diagramPaths')).toContain(
        editorFile.path
    );
    expect(mock.contextKeys.get('chartdb.diagramPaths')).not.toContain(
        hostFile.toString()
    );
});

it('offers the action for the configured DBML source regardless of language mode', async () => {
    const actions = await lenses('/repo/schema.dbml');
    expect(actions).toHaveLength(1);
    expect(actions[0].command.arguments![0].path).toBe('/repo/schema.dbml');
    expect(await lenses('/repo/other.dbml')).toEqual([]);
    const [selector] = mock.languages.registerCodeLensProvider.mock.calls[0];
    expect(selector).toEqual([
        { pattern: '**/*.json' },
        { pattern: '**/*.dbml' },
    ]);
    await mock.registered.get('chartdb.open')!(
        new mock.Uri('/repo/schema.dbml')
    );
    expect(mock.panels).toHaveLength(1);
});
