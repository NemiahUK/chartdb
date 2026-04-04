import { dbIndexSchema, type DBIndex } from './db-index';
import { dbFieldSchema, type DBField } from './db-field';
import type { DBRelationship } from './db-relationship';
import {
    dbCheckConstraintSchema,
    type DBCheckConstraint,
} from './db-check-constraint';
import { deepCopy, findContainingArea } from '../utils';
import { schemaNameToDomainSchemaName } from './db-schema';
import { z } from 'zod';
import type { Area } from './area';

export const MAX_TABLE_SIZE = 450;
export const MID_TABLE_SIZE = 337;
export const MIN_TABLE_SIZE = 224;
export const TABLE_MINIMIZED_FIELDS = 10;
const TABLE_LAYOUT_SPACING = 200;
const TABLE_LAYOUT_START_X = 100;
const TABLE_LAYOUT_START_Y = 100;
const DEFAULT_LAYOUT_ASPECT_RATIO = 16 / 10;

export interface DBTable {
    id: string;
    name: string;
    schema?: string | null;
    x: number;
    y: number;
    fields: DBField[];
    indexes: DBIndex[];
    checkConstraints?: DBCheckConstraint[] | null;
    color: string;
    isView: boolean;
    isMaterializedView?: boolean | null;
    createdAt: number;
    width?: number | null;
    comments?: string | null;
    order?: number | null;
    expanded?: boolean | null;
    parentAreaId?: string | null;
}

export const dbTableSchema: z.ZodType<DBTable> = z.object({
    id: z.string(),
    name: z.string(),
    schema: z.string().or(z.null()).optional(),
    x: z.number(),
    y: z.number(),
    fields: z.array(dbFieldSchema),
    indexes: z.array(dbIndexSchema),
    checkConstraints: z.array(dbCheckConstraintSchema).or(z.null()).optional(),
    color: z.string(),
    isView: z.boolean(),
    isMaterializedView: z.boolean().or(z.null()).optional(),
    createdAt: z.number(),
    width: z.number().or(z.null()).optional(),
    comments: z.string().or(z.null()).optional(),
    order: z.number().or(z.null()).optional(),
    expanded: z.boolean().or(z.null()).optional(),
    parentAreaId: z.string().or(z.null()).optional(),
});

export const generateTableKey = ({
    schemaName,
    tableName,
}: {
    schemaName: string | null | undefined;
    tableName: string;
}) => `${schemaNameToDomainSchemaName(schemaName) ?? ''}.${tableName}`;

export const adjustTablePositions = ({
    relationships: inputRelationships,
    tables: inputTables,
    areas: inputAreas = [],
    mode = 'all',
}: {
    tables: DBTable[];
    relationships: DBRelationship[];
    areas?: Area[];
    mode?: 'all' | 'perSchema';
}): DBTable[] => {
    // Deep copy inputs for manipulation
    const tables = deepCopy(inputTables);
    const relationships = deepCopy(inputRelationships);
    const areas = deepCopy(inputAreas);

    // If there are no areas, fall back to the original algorithm
    if (areas.length === 0) {
        return adjustTablePositionsWithoutAreas(tables, relationships, mode);
    }

    // Update parentAreaId based on geometric containment before grouping
    // This ensures tables that are visually inside an area get assigned to it
    tables.forEach((table) => {
        const containingArea = findContainingArea(table, areas);
        table.parentAreaId = containingArea?.id || null;
    });

    // Group tables by their parent area
    const tablesByArea = new Map<string | null, DBTable[]>();

    // Initialize with empty arrays for all areas
    areas.forEach((area) => {
        tablesByArea.set(area.id, []);
    });

    // Also create a group for tables without areas
    tablesByArea.set(null, []);

    // Group tables
    tables.forEach((table) => {
        const areaId = table.parentAreaId || null;
        if (areaId && tablesByArea.has(areaId)) {
            tablesByArea.get(areaId)!.push(table);
        } else {
            // If the area doesn't exist or table has no area, put it in the null group
            tablesByArea.get(null)!.push(table);
        }
    });

    // Check and adjust tables within each area
    areas.forEach((area) => {
        const tablesInArea = tablesByArea.get(area.id) || [];
        if (tablesInArea.length === 0) return;

        // Only reposition tables that are outside their area bounds
        const tablesToReposition = tablesInArea.filter((table) => {
            return !isTableInsideArea(table, area);
        });

        if (tablesToReposition.length > 0) {
            // Create a sub-graph of relationships for tables that need repositioning
            const areaRelationships = relationships.filter((rel) => {
                const sourceNeedsReposition = tablesToReposition.some(
                    (t) => t.id === rel.sourceTableId
                );
                const targetNeedsReposition = tablesToReposition.some(
                    (t) => t.id === rel.targetTableId
                );
                return sourceNeedsReposition && targetNeedsReposition;
            });

            // Position only tables that are outside the area bounds
            positionTablesWithinArea(
                tablesToReposition,
                areaRelationships,
                area
            );
        }
        // Tables already inside the area keep their positions
    });

    // Position free tables (those not in any area)
    const freeTables = tablesByArea.get(null) || [];
    if (freeTables.length > 0) {
        // Create a sub-graph of relationships for free tables
        const freeRelationships = relationships.filter((rel) => {
            const sourceIsFree = freeTables.some(
                (t) => t.id === rel.sourceTableId
            );
            const targetIsFree = freeTables.some(
                (t) => t.id === rel.targetTableId
            );
            return sourceIsFree && targetIsFree;
        });

        // Use the original algorithm for free tables with area avoidance
        adjustTablePositionsWithoutAreas(
            freeTables,
            freeRelationships,
            mode,
            areas
        );
    }

    return tables;
};

// Helper function to check if a table is inside an area
function isTableInsideArea(table: DBTable, area: Area): boolean {
    const tableDimensions = getTableDimensions(table);
    const padding = 20; // Same padding as used in positioning

    return (
        table.x >= area.x + padding &&
        table.x + tableDimensions.width <= area.x + area.width - padding &&
        table.y >= area.y + padding &&
        table.y + tableDimensions.height <= area.y + area.height - padding
    );
}

// Helper function to position tables within an area
function positionTablesWithinArea(
    tables: DBTable[],
    _relationships: DBRelationship[],
    area: Area
) {
    if (tables.length === 0) return;

    const padding = 20; // Padding from area edges
    const gapX = TABLE_LAYOUT_SPACING;
    const gapY = TABLE_LAYOUT_SPACING;

    // Available space within the area
    const availableWidth = area.width - 2 * padding;

    const widestTable = Math.max(
        ...tables.map((table) => getTableDimensions(table).width)
    );
    const cols = Math.max(
        1,
        Math.floor((availableWidth + gapX) / (widestTable + gapX))
    );
    const positionedTables = createGridPositions({
        tables,
        startX: area.x + padding,
        startY: area.y + padding,
        columns: cols,
        horizontalGap: gapX,
        verticalGap: gapY,
        availableWidth,
    });

    tables.forEach((table) => {
        const nextPosition = positionedTables.get(table.id);
        const tableDimensions = getTableDimensions(table);
        const maxX = area.x + area.width - padding - tableDimensions.width;
        const maxY = area.y + area.height - padding - tableDimensions.height;

        table.x = Math.min(nextPosition?.x ?? table.x, maxX);
        table.y = Math.min(nextPosition?.y ?? table.y, maxY);
        table.x = Math.max(table.x, area.x + padding);
        table.y = Math.max(table.y, area.y + padding);
    });
}

function createGridPositions({
    tables,
    startX,
    startY,
    columns,
    horizontalGap,
    verticalGap,
    availableWidth,
}: {
    tables: DBTable[];
    startX: number;
    startY: number;
    columns: number;
    horizontalGap: number;
    verticalGap: number;
    availableWidth?: number;
}): Map<string, { x: number; y: number }> {
    const safeColumns = Math.max(1, columns);
    const maxColumnWidth = Math.max(
        ...tables.map((table) => getTableDimensions(table).width)
    );
    const positions = new Map<string, { x: number; y: number }>();
    let currentY = startY;

    for (let index = 0; index < tables.length; index += safeColumns) {
        const rowTables = tables.slice(index, index + safeColumns);
        const rowHeight = Math.max(
            ...rowTables.map((table) => getTableDimensions(table).height)
        );
        const rowWidth =
            rowTables.length * maxColumnWidth +
            Math.max(0, rowTables.length - 1) * horizontalGap;
        const rowStartX =
            availableWidth && rowWidth < availableWidth
                ? startX + (availableWidth - rowWidth) / 2
                : startX;

        rowTables.forEach((table, rowIndex) => {
            const { width, height } = getTableDimensions(table);
            positions.set(table.id, {
                x:
                    rowStartX +
                    rowIndex * (maxColumnWidth + horizontalGap) +
                    (maxColumnWidth - width) / 2,
                y: currentY + (rowHeight - height) / 2,
            });
        });

        currentY += rowHeight + verticalGap;
    }

    return positions;
}

function getLayoutAspectRatio() {
    if (typeof window !== 'undefined') {
        return window.innerWidth / Math.max(window.innerHeight, 1);
    }

    return DEFAULT_LAYOUT_ASPECT_RATIO;
}

function getSuggestedColumnCount({
    tables,
    horizontalGap,
    verticalGap,
    availableWidth,
}: {
    tables: DBTable[];
    horizontalGap: number;
    verticalGap: number;
    availableWidth?: number;
}) {
    if (tables.length === 0) {
        return 1;
    }

    const maxColumnWidth = Math.max(
        ...tables.map((table) => getTableDimensions(table).width)
    );
    const averageTableHeight =
        tables.reduce(
            (sum, table) => sum + getTableDimensions(table).height,
            0
        ) / tables.length;

    const aspectRatio = getLayoutAspectRatio();
    const estimatedColumns = Math.round(
        Math.sqrt(
            (aspectRatio * tables.length * (averageTableHeight + verticalGap)) /
                (maxColumnWidth + horizontalGap)
        )
    );

    const widthLimitedColumns =
        availableWidth === undefined
            ? tables.length
            : Math.max(
                  1,
                  Math.floor(
                      (availableWidth + horizontalGap) /
                          (maxColumnWidth + horizontalGap)
                  )
              );

    return Math.max(
        1,
        Math.min(tables.length, widthLimitedColumns, estimatedColumns || 1)
    );
}

// Original algorithm with area avoidance
function adjustTablePositionsWithoutAreas(
    tables: DBTable[],
    relationships: DBRelationship[],
    mode: 'all' | 'perSchema',
    areas: Area[] = []
): DBTable[] {
    const adjustPositionsForTables = (tablesToAdjust: DBTable[]) => {
        const defaultTableWidth = 200;
        const defaultTableHeight = 300;
        const gapX = TABLE_LAYOUT_SPACING;
        const gapY = TABLE_LAYOUT_SPACING;
        const startX = TABLE_LAYOUT_START_X;
        const startY = TABLE_LAYOUT_START_Y;

        // Create a map of table connections
        const tableConnections = new Map<string, Set<string>>();
        relationships.forEach((rel) => {
            if (!tableConnections.has(rel.sourceTableId)) {
                tableConnections.set(rel.sourceTableId, new Set());
            }
            if (!tableConnections.has(rel.targetTableId)) {
                tableConnections.set(rel.targetTableId, new Set());
            }
            tableConnections.get(rel.sourceTableId)!.add(rel.targetTableId);
            tableConnections.get(rel.targetTableId)!.add(rel.sourceTableId);
        });

        const sortedTables = [...tablesToAdjust].sort(
            (a, b) =>
                (tableConnections.get(b.id)?.size || 0) -
                (tableConnections.get(a.id)?.size || 0)
        );

        const positionedTables = new Set<string>();
        const tablePositions = new Map<string, { x: number; y: number }>();

        const getTableWidthAndHeight = (
            tableId: string
        ): {
            width: number;
            height: number;
        } => {
            const table = tablesToAdjust.find((t) => t.id === tableId);

            if (!table)
                return { width: defaultTableWidth, height: defaultTableHeight };

            return getTableDimensions(table);
        };

        const isOverlapping = (
            x: number,
            y: number,
            currentTableId: string
        ): boolean => {
            // Check overlap with other tables
            for (const [tableId, pos] of tablePositions) {
                if (tableId === currentTableId) continue;

                const { width, height } = getTableWidthAndHeight(tableId);
                if (
                    Math.abs(x - pos.x) < width + gapX &&
                    Math.abs(y - pos.y) < height + gapY
                ) {
                    return true;
                }
            }

            // Check overlap with areas
            const { width: currentWidth, height: currentHeight } =
                getTableWidthAndHeight(currentTableId);
            const buffer = 50; // Add buffer around areas to keep tables away

            for (const area of areas) {
                // Check if the table position would overlap with the area (with buffer)
                if (
                    !(
                        x + currentWidth < area.x - buffer ||
                        x > area.x + area.width + buffer ||
                        y + currentHeight < area.y - buffer ||
                        y > area.y + area.height + buffer
                    )
                ) {
                    return true;
                }
            }

            return false;
        };

        const doesGridOverlap = (
            positions: Map<string, { x: number; y: number }>,
            groupTables: DBTable[]
        ) => {
            return groupTables.some((table) => {
                const position = positions.get(table.id);

                if (!position) {
                    return false;
                }

                return isOverlapping(position.x, position.y, table.id);
            });
        };

        const shiftGridPositions = (
            positions: Map<string, { x: number; y: number }>,
            shiftY: number
        ) => {
            return new Map(
                [...positions.entries()].map(([tableId, position]) => [
                    tableId,
                    {
                        x: position.x,
                        y: position.y + shiftY,
                    },
                ])
            );
        };

        const placeTableGroup = (
            groupTables: DBTable[],
            baseY: number,
            availableWidth?: number
        ) => {
            if (groupTables.length === 0) {
                return baseY;
            }

            const columnCount = getSuggestedColumnCount({
                tables: groupTables,
                horizontalGap: gapX,
                verticalGap: gapY,
                availableWidth,
            });
            let plannedPositions = createGridPositions({
                tables: groupTables,
                startX,
                startY: baseY,
                columns: columnCount,
                horizontalGap: gapX,
                verticalGap: gapY,
                availableWidth,
            });

            let safety = 0;
            while (
                doesGridOverlap(plannedPositions, groupTables) &&
                safety < 200
            ) {
                plannedPositions = shiftGridPositions(plannedPositions, gapY);
                safety++;
            }

            let maxBottom = baseY;

            groupTables.forEach((table) => {
                if (positionedTables.has(table.id)) {
                    return;
                }

                const plannedPosition = plannedPositions.get(table.id) ?? {
                    x: startX,
                    y: baseY,
                };
                table.x = plannedPosition.x;
                table.y = plannedPosition.y;
                tablePositions.set(table.id, plannedPosition);
                positionedTables.add(table.id);

                const { height } = getTableWidthAndHeight(table.id);
                maxBottom = Math.max(maxBottom, plannedPosition.y + height);
            });

            return maxBottom + gapY;
        };

        placeTableGroup(sortedTables, startY);

        // Apply positions to tables
        tablesToAdjust.forEach((table) => {
            const position = tablePositions.get(table.id);
            if (position) {
                table.x = position.x;
                table.y = position.y;
            }
        });
    };

    if (mode === 'perSchema') {
        // Group tables by schema
        const tablesBySchema = tables.reduce(
            (acc, table) => {
                const schema = table.schema || 'default';
                if (!acc[schema]) {
                    acc[schema] = [];
                }
                acc[schema].push(table);
                return acc;
            },
            {} as Record<string, DBTable[]>
        );

        // Adjust positions for each schema group
        Object.values(tablesBySchema).forEach(adjustPositionsForTables);
    } else {
        // Adjust positions for all tables
        adjustPositionsForTables(tables);
    }

    return tables;
}

export const calcTableHeight = (table?: DBTable): number => {
    if (!table) {
        return 300;
    }

    const FIELD_HEIGHT = 32; // h-8 per field
    const TABLE_FOOTER_HEIGHT = 32; // h-8 for show more button
    const TABLE_HEADER_HEIGHT = 42;
    // Calculate how many fields are visible
    const fieldCount = table.fields.length;
    let visibleFieldCount = fieldCount;

    // If not expanded, use minimum of field count and TABLE_MINIMIZED_FIELDS
    if (!table.expanded) {
        visibleFieldCount = Math.min(fieldCount, TABLE_MINIMIZED_FIELDS);
    }

    // Calculate height based on visible fields
    const fieldsHeight = visibleFieldCount * FIELD_HEIGHT;
    const showMoreButtonHeight =
        fieldCount > TABLE_MINIMIZED_FIELDS ? TABLE_FOOTER_HEIGHT : 0;

    return TABLE_HEADER_HEIGHT + fieldsHeight + showMoreButtonHeight;
};

export const getTableDimensions = (
    table: DBTable
): { width: number; height: number } => {
    const height = calcTableHeight(table);
    const width = table.width || MIN_TABLE_SIZE;
    return { width, height };
};
