import { z } from 'zod';
import { areaSchema } from '@/lib/domain/area';
import { noteSchema } from '@/lib/domain/note';
import type { DBTable } from '@/lib/domain/db-table';
import type { Diagram } from '@/lib/domain/diagram';

// This is the complete allowlist of table properties the repository editor may write.
export const tablePresentationSchema = z.object({
    x: z.number().finite().optional(),
    y: z.number().finite().optional(),
    color: z.string().optional(),
    width: z.number().finite().positive().nullable().optional(),
    order: z.number().finite().nullable().optional(),
    expanded: z.boolean().nullable().optional(),
    parentAreaId: z.string().nullable().optional(),
});

export const layoutSchema = z
    .object({
        version: z.literal(1),
        tables: z.record(tablePresentationSchema.strict()),
        areas: z.array(areaSchema),
        notes: z.array(noteSchema),
    })
    .strict();
export type RepositoryLayout = z.infer<typeof layoutSchema>;

export const emptyLayout = (): RepositoryLayout => ({
    version: 1,
    tables: {},
    areas: [],
    notes: [],
});

export const tableKey = (table: Pick<DBTable, 'schema' | 'name'>) =>
    JSON.stringify([table.schema ?? '', table.name]);

export const presentationOnly = (table: Partial<DBTable>) =>
    tablePresentationSchema.parse(table);

export function extractLayout(
    diagram: Diagram,
    previous = emptyLayout()
): RepositoryLayout {
    // Keep absent tables' presentation so branch switches and temporary removals
    // don't erase it. The schema determines which tables are actually displayed.
    const tables = { ...previous.tables };
    for (const table of diagram.tables ?? []) {
        tables[tableKey(table)] = presentationOnly(table);
    }
    return layoutSchema.parse({
        version: 1,
        tables,
        areas: diagram.areas ?? [],
        notes: diagram.notes ?? [],
    });
}

export function applyLayout(
    diagram: Diagram,
    layout: RepositoryLayout
): Diagram {
    const areaIds = new Set(layout.areas.map((area) => area.id));
    return {
        ...diagram,
        tables: diagram.tables?.map((table) => {
            const presentation = layout.tables[tableKey(table)];
            return {
                ...table,
                ...presentation,
                parentAreaId:
                    presentation?.parentAreaId &&
                    areaIds.has(presentation.parentAreaId)
                        ? presentation.parentAreaId
                        : null,
            };
        }),
        areas: layout.areas,
        notes: layout.notes,
    };
}

export function serializeLayout(layout: RepositoryLayout): string {
    const parsed = layoutSchema.parse(layout);
    return (
        JSON.stringify(
            {
                ...parsed,
                tables: Object.fromEntries(
                    Object.entries(parsed.tables).sort(([a], [b]) =>
                        a.localeCompare(b)
                    )
                ),
            },
            null,
            2
        ) + '\n'
    );
}

// Read old exports without their importer's ID regeneration. Only presentation
// properties survive; columns and relationships never enter the layout document.
export function layoutFromExport(input: unknown): RepositoryLayout {
    const exported = z
        .object({
            tables: z.array(
                tablePresentationSchema.extend({
                    name: z.string(),
                    schema: z.string().nullable().optional(),
                })
            ),
            areas: z.array(areaSchema).default([]),
            notes: z.array(noteSchema).default([]),
        })
        .parse(input);
    return layoutSchema.parse({
        version: 1,
        tables: Object.fromEntries(
            exported.tables.map((table) => [
                tableKey(table),
                presentationOnly(table),
            ])
        ),
        areas: exported.areas,
        notes: exported.notes,
    });
}
