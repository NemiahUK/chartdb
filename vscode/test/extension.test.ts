import { beforeEach, describe, expect, it } from 'vitest';
import type { ExtensionContext } from 'vscode';
import * as mock from './vscode-mock';
import { activate } from '../src/extension';
import { emptyLayout, serializeLayout } from '../../src/repository/layout';
import type {
    HostMessage,
    RepositorySnapshot,
} from '../../src/repository/protocol';
import { configSchema } from '../src/config';

const tick = () => new Promise((resolve) => setTimeout(resolve, 30));
const messages = () =>
    mock.panels[0].webview.postMessage.mock.calls.map(
        ([message]) => message as HostMessage
    );
const snapshot = () =>
    (
        messages().find((message) => message.type === 'snapshot') as {
            snapshot: RepositorySnapshot;
        }
    ).snapshot;
async function send(message: unknown) {
    mock.panels[0].receive!(message);
    await tick();
}

beforeEach(async () => {
    mock.reset();
    mock.files.set(
        '/repo/.chartdb.json',
        JSON.stringify({
            version: 1,
            schema: 'schema.dbml',
            layout: 'layout.json',
        })
    );
    mock.files.set('/repo/schema.dbml', 'Table users {\n id int\n}');
    mock.files.set('/repo/layout.json', serializeLayout(emptyLayout()));
    activate(mock.context as unknown as ExtensionContext);
    await mock.registered.get('chartdb.open')!();
    await send({ type: 'ready' });
});

describe('extension file bridge', () => {
    it('loads the configured files and saves only validated presentation', async () => {
        const schema = mock.files.get('/repo/schema.dbml');
        const layout = {
            ...emptyLayout(),
            tables: { '["","users"]': { x: 12, color: '#abcdef' } },
        };
        await send({
            type: 'save',
            requestId: 1,
            revision: snapshot().revision,
            layout,
        });
        expect(messages().at(-1)?.type).toBe('saved');
        expect(mock.files.get('/repo/layout.json')).toBe(
            serializeLayout(layout)
        );
        expect(mock.files.get('/repo/schema.dbml')).toBe(schema);
        await send({
            type: 'save',
            requestId: 2,
            revision: snapshot().revision,
            layout: { ...layout, tables: { users: { fields: [] } } },
        });
        expect(messages().at(-1)?.type).toBe('error');
        expect(mock.files.get('/repo/layout.json')).toBe(
            serializeLayout(layout)
        );
    });

    it('does not overwrite external changes or dirty text documents', async () => {
        const revision = snapshot().revision;
        const external = serializeLayout({
            ...emptyLayout(),
            tables: { users: { x: 99 } },
        });
        mock.files.set('/repo/layout.json', external);
        await send({
            type: 'save',
            requestId: 1,
            revision,
            layout: emptyLayout(),
        });
        expect(messages().at(-1)?.type).toBe('error');
        expect(mock.files.get('/repo/layout.json')).toBe(external);
        await send({ type: 'reload', dirty: false });
        const latest = messages().at(-1) as { snapshot: RepositorySnapshot };
        const document = await mock.workspace.openTextDocument(
            new mock.Uri('/repo/layout.json')
        );
        document.isDirty = true;
        await send({
            type: 'save',
            requestId: 2,
            revision: latest.snapshot.revision,
            layout: emptyLayout(),
        });
        expect(messages().at(-1)?.type).toBe('error');
        expect(mock.files.get('/repo/layout.json')).toBe(external);
    });

    it('notifies the UI after a schema change and ignores unrelated files', async () => {
        const count = messages().length;
        mock.fileListeners.forEach((listener) =>
            listener(new mock.Uri('/repo/unrelated.txt'))
        );
        await tick();
        expect(messages()).toHaveLength(count);
        mock.files.set('/repo/schema.dbml', 'Table new_table {\n id int\n}');
        mock.fileListeners.forEach((listener) =>
            listener(new mock.Uri('/repo/schema.dbml'))
        );
        await tick();
        expect(messages().at(-1)).toMatchObject({
            type: 'snapshot',
            snapshot: { dbml: 'Table new_table {\n id int\n}' },
        });
    });

    it('seeds a missing layout from an export without modifying the export', async () => {
        mock.files.delete('/repo/layout.json');
        const seed = JSON.stringify({
            tables: [
                {
                    name: 'users',
                    x: 50,
                    y: 60,
                    color: '#123456',
                    fields: [{ name: 'old' }],
                },
            ],
        });
        mock.files.set('/repo/export.json', seed);
        mock.files.set(
            '/repo/.chartdb.json',
            JSON.stringify({
                version: 1,
                schema: 'schema.dbml',
                layout: 'layout.json',
                importLayoutFrom: 'export.json',
            })
        );
        await send({ type: 'reload', dirty: false });
        const { snapshot: loaded } = messages().at(-1) as {
            snapshot: RepositorySnapshot;
        };
        expect(loaded.needsInitialSave).toBe(true);
        await send({
            type: 'save',
            requestId: 1,
            revision: loaded.revision,
            layout: loaded.layout,
        });
        expect(messages().at(-1)?.type).toBe('saved');
        expect(mock.files.get('/repo/export.json')).toBe(seed);
        expect(mock.files.get('/repo/layout.json')).not.toContain('old');
    });

    it('flushes the latest draft when the tab closes before its debounce', async () => {
        const layout = { ...emptyLayout(), tables: { users: { x: 65 } } };
        await send({
            type: 'draft',
            revision: snapshot().revision,
            layout,
            dirty: true,
        });
        mock.panels[0].dispose();
        await tick();
        expect(mock.files.get('/repo/layout.json')).toBe(
            serializeLayout(layout)
        );
        expect(mock.stored.size).toBe(0);
    });

    it('retains a conflicting draft for recovery when the tab closes', async () => {
        await send({
            type: 'draft',
            revision: snapshot().revision,
            layout: { ...emptyLayout(), tables: { users: { x: 65 } } },
            dirty: true,
        });
        const external = serializeLayout({
            ...emptyLayout(),
            tables: { users: { x: 22 } },
        });
        mock.files.set('/repo/layout.json', external);
        mock.panels[0].dispose();
        await tick();
        expect(mock.files.get('/repo/layout.json')).toBe(external);
        expect(mock.stored.size).toBe(1);
    });

    it('rejects paths outside the repo and using an export as the output file', () => {
        const config = {
            version: 1,
            schema: 'schema.dbml',
            layout: 'layout.json',
        };
        expect(() =>
            configSchema.parse({ ...config, layout: '../other.json' })
        ).toThrow();
        expect(() =>
            configSchema.parse({ ...config, layout: '.git/config.json' })
        ).toThrow();
        expect(() =>
            configSchema.parse({ ...config, importLayoutFrom: 'layout.json' })
        ).toThrow();
    });
});
