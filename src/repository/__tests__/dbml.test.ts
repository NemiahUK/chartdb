import { DatabaseType } from '@/lib/domain/database-type';
import { expect, it } from 'vitest';
import { normalizeGeneratedNotes, describeDBMLError } from '../dbml';
import { importDBMLToDiagram } from '@/lib/dbml/dbml-import/dbml-import';

it('imports generated multiline notes, including escaped apostrophes, without changing schema', async () => {
    const source =
        "Table devices {\n id int [pk]\n Note: 'A device\\'s hardware identity.\nRetained as an opaque string.'\n name varchar\n}";
    const normalized = normalizeGeneratedNotes(source);
    const diagram = await importDBMLToDiagram(normalized, {
        databaseType: DatabaseType.GENERIC,
    });
    expect(diagram.tables![0].fields.map((f) => f.name)).toEqual([
        'id',
        'name',
    ]);
    expect(diagram.tables![0].comments).toContain(
        "A device's hardware identity."
    );
    expect(diagram.tables![0].comments).toContain(
        'Retained as an opaque string.'
    );
    expect(normalized.split('\n')).toHaveLength(source.split('\n').length);
});

it('leaves existing multiline and single-line notes unchanged', () => {
    const source =
        "Table t {\n id int\n Note: '''Already\nmultiline'''\n}\nTable u {\n id int [note: 'inline']\n Note: 'single line'\n}";
    expect(normalizeGeneratedNotes(source)).toBe(source);
});

it('reports parser diagnostics with their source location', () => {
    expect(
        describeDBMLError({
            diags: [
                {
                    message: 'Invalid note',
                    location: { start: { line: 4, column: 2 } },
                },
            ],
        })
    ).toBe('line 4, column 2: Invalid note');
});
