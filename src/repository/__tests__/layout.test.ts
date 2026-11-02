import { describe, expect, it } from 'vitest';
import {
    applyLayout,
    emptyLayout,
    extractLayout,
    layoutFromExport,
    layoutSchema,
    serializeLayout,
    tableKey,
} from '../layout';
import { importDBMLToDiagram } from '@/lib/dbml/dbml-import/dbml-import';
import { DatabaseType } from '@/lib/domain/database-type';

const parse = (text: string) =>
    importDBMLToDiagram(text, { databaseType: DatabaseType.GENERIC });

describe('repository layout', () => {
    it('preserves presentation across regeneration while taking fields and relationships from DBML', async () => {
        const old = await parse(
            'Table users {\n id int [pk]\n old_column text\n}'
        );
        old.tables![0] = {
            ...old.tables![0],
            x: 123,
            y: 456,
            color: '#abcdef',
            width: 330,
        };
        const layout = extractLayout(old);
        const regenerated = await parse(
            'Table users {\n id int [pk]\n email varchar\n}\nTable posts {\n id int [pk]\n user_id int [ref: > users.id]\n}'
        );
        const merged = applyLayout(regenerated, layout);
        const users = merged.tables!.find((t) => t.name === 'users')!;
        expect(users).toMatchObject({
            x: 123,
            y: 456,
            color: '#abcdef',
            width: 330,
        });
        expect(users.fields.map((f) => f.name)).toEqual(['id', 'email']);
        expect(merged.relationships).toHaveLength(1);
        expect(users.id).not.toBe(old.tables![0].id);
        expect(JSON.stringify(layout)).not.toContain('old_column');
    });

    it('keeps distinct schemas, preserves orphaned layouts and does not infer renames', async () => {
        const diagram = await parse(
            'Table one.users {\n id int\n}\nTable two.users {\n id int\n}'
        );
        diagram.tables![0].x = 100;
        diagram.tables![1].x = 200;
        const layout = extractLayout(diagram);
        expect(Object.keys(layout.tables)).toHaveLength(2);
        const removed = { ...diagram, tables: [diagram.tables![0]] };
        expect(extractLayout(removed, layout)).toEqual(layout);
        const renamed = {
            ...diagram,
            tables: [{ ...diagram.tables![0], name: 'people', x: 0 }],
        };
        expect(applyLayout(renamed, layout).tables![0].x).toBe(0);
    });

    it('migrates old exports without retaining schema properties or volatile IDs', () => {
        const layout = layoutFromExport({
            tables: [
                {
                    id: '1',
                    name: 'users',
                    x: 7,
                    y: 8,
                    color: 'red',
                    fields: [{ name: 'secret' }],
                    diagramId: '0',
                },
            ],
            areas: [],
            notes: [],
        });
        expect(layout.tables[tableKey({ name: 'users' })]).toEqual({
            x: 7,
            y: 8,
            color: 'red',
        });
        expect(serializeLayout(layout)).not.toContain('secret');
        expect(serializeLayout(layout)).not.toContain('diagramId');
    });

    it('rejects schema data and invalid positions at the file boundary', () => {
        expect(() =>
            layoutSchema.parse({
                ...emptyLayout(),
                tables: { users: { fields: [] } },
            })
        ).toThrow();
        expect(() =>
            layoutSchema.parse({
                ...emptyLayout(),
                tables: { users: { x: Infinity } },
            })
        ).toThrow();
        expect(() =>
            layoutSchema.parse({ ...emptyLayout(), version: 2 })
        ).toThrow();
    });

    it('retains notes and areas, clears stale area membership and serializes deterministically', async () => {
        const diagram = await parse('Table users {\n id int\n}');
        const table = diagram.tables![0];
        const layout = extractLayout(diagram);
        layout.tables[tableKey(table)].parentAreaId = 'missing';
        layout.notes.push({
            id: 'note',
            content: 'Design note',
            x: 1,
            y: 2,
            width: 100,
            height: 100,
            color: '#ffffff',
        });
        expect(applyLayout(diagram, layout).tables![0].parentAreaId).toBeNull();
        expect(applyLayout(diagram, layout).notes).toEqual(layout.notes);
        expect(serializeLayout(layout)).toBe(
            serializeLayout(JSON.parse(serializeLayout(layout)))
        );
    });
});
