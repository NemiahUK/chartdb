import { describe, expect, it, vi } from 'vitest';
import { lockSchema } from '../guard';
import type { ChartDBContext } from '@/context/chartdb-context/chartdb-context';
import { importDBMLToDiagram } from '@/lib/dbml/dbml-import/dbml-import';
import { DatabaseType } from '@/lib/domain/database-type';

describe('repository schema lock', () => {
    it('rejects structural mutations even when invoked without the UI', async () => {
        const context = lockSchema({} as ChartDBContext);
        await expect(context.createTable({ name: 'injected' })).rejects.toThrow(
            'Schema is managed'
        );
        await expect(context.removeTable('a')).rejects.toThrow();
        await expect(
            context.updateField('a', 'b', { name: 'changed' })
        ).rejects.toThrow();
        await expect(
            context.createRelationship({
                sourceTableId: 'a',
                targetTableId: 'b',
                sourceFieldId: 'a',
                targetFieldId: 'b',
            })
        ).rejects.toThrow();
    });

    it('allows only presentation in table updates, including full-table undo snapshots', async () => {
        const updateTable = vi.fn();
        const context = lockSchema({
            updateTable,
        } as unknown as ChartDBContext);
        await context.updateTable('a', {
            name: 'renamed',
            x: 30,
            fields: [],
            color: '#123456',
        });
        expect(updateTable).toHaveBeenCalledWith(
            'a',
            { x: 30, color: '#123456' },
            undefined
        );
    });

    it('prevents bulk removal, addition, mutation and schema replacement through undo', async () => {
        const diagram = await importDBMLToDiagram(
            'Table users {\n id int\n}\nTable posts {\n id int\n}',
            { databaseType: DatabaseType.GENERIC }
        );
        const tables = diagram.tables!;
        let result = tables;
        const context = lockSchema({
            updateTablesState: async (fn) => {
                result = fn(tables) as typeof tables;
            },
        } as ChartDBContext);
        await context.updateTablesState(
            (current) => {
                current[0].fields = [];
                return [
                    { ...current[0], x: 55 },
                    { ...current[1], id: 'injected' },
                ];
            },
            { updateHistory: false, forceOverride: true }
        );
        expect(result).toHaveLength(2);
        expect(result[0].x).toBe(55);
        expect(result[0].fields).toHaveLength(1);
        expect(result[1]).toEqual(tables[1]);
        expect(tables[0].fields).toHaveLength(1);
    });
});
