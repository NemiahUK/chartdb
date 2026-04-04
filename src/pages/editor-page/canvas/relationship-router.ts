import {
    TABLE_MINIMIZED_FIELDS,
    getTableDimensions,
    type DBTable,
} from '@/lib/domain/db-table';
import type { DBRelationship } from '@/lib/domain/db-relationship';

const FIELD_HEIGHT = 32;
const TABLE_HEADER_HEIGHT = 42;
const EXIT_DISTANCE = 40;
const SELF_RELATION_GAP = 80;
const TABLE_KEEP_OUT_MARGIN = 32;
const KEEP_OUT_LANE_GAP = 24;

type Side = 'left' | 'right';

interface Rect {
    left: number;
    right: number;
    top: number;
    bottom: number;
}

interface RelationshipEndpoint {
    relationshipId: string;
    kind: 'source' | 'target';
    tableId: string;
    fieldId: string;
    side: Side;
    y: number;
}

export interface RoutePoint {
    x: number;
    y: number;
}

export interface RelationshipRoute {
    points: RoutePoint[];
    sourceSide: Side;
    targetSide: Side;
    midpoint: RoutePoint;
}

const getEndpointKey = ({
    relationshipId,
    kind,
}: Pick<RelationshipEndpoint, 'relationshipId' | 'kind'>) =>
    `${relationshipId}:${kind}`;

const getVisibleFields = ({
    table,
    relatedFieldIds,
}: {
    table: DBTable;
    relatedFieldIds: Set<string>;
}) => {
    if (table.expanded || table.fields.length <= TABLE_MINIMIZED_FIELDS) {
        return table.fields;
    }

    const mustDisplay = table.fields.filter(
        (field) => relatedFieldIds.has(field.id) || field.primaryKey
    );
    const optional = table.fields.filter(
        (field) => !relatedFieldIds.has(field.id) && !field.primaryKey
    );
    const visibleMustDisplay = mustDisplay.slice(0, TABLE_MINIMIZED_FIELDS);
    const remainingSlots = TABLE_MINIMIZED_FIELDS - visibleMustDisplay.length;
    const visibleOptional =
        remainingSlots > 0 ? optional.slice(0, remainingSlots) : [];
    const visibleSet = new Set([
        ...visibleMustDisplay.map((field) => field.id),
        ...visibleOptional.map((field) => field.id),
    ]);

    return table.fields.filter((field) => visibleSet.has(field.id));
};

const getFieldAnchorY = ({
    table,
    fieldId,
    relatedFieldIds,
}: {
    table: DBTable;
    fieldId: string;
    relatedFieldIds: Set<string>;
}) => {
    const visibleFields = getVisibleFields({ table, relatedFieldIds });
    const visibleIndex = visibleFields.findIndex(
        (field) => field.id === fieldId
    );

    if (visibleIndex >= 0) {
        return (
            table.y +
            TABLE_HEADER_HEIGHT +
            visibleIndex * FIELD_HEIGHT +
            FIELD_HEIGHT / 2
        );
    }

    if (visibleFields.length > 0) {
        return (
            table.y +
            TABLE_HEADER_HEIGHT +
            (visibleFields.length - 1) * FIELD_HEIGHT +
            FIELD_HEIGHT / 2
        );
    }

    return table.y + getTableDimensions(table).height / 2;
};

const getKeepOutRect = (table: DBTable): Rect => {
    const { width, height } = getTableDimensions(table);

    return {
        left: table.x - TABLE_KEEP_OUT_MARGIN,
        right: table.x + width + TABLE_KEEP_OUT_MARGIN,
        top: table.y - TABLE_KEEP_OUT_MARGIN,
        bottom: table.y + height + TABLE_KEEP_OUT_MARGIN,
    };
};

const arePointsEqual = (first: RoutePoint, second: RoutePoint) =>
    Math.round(first.x) === Math.round(second.x) &&
    Math.round(first.y) === Math.round(second.y);

const getManhattanDistance = (from: RoutePoint, to: RoutePoint) =>
    Math.abs(from.x - to.x) + Math.abs(from.y - to.y);

const getPathLength = (points: RoutePoint[]) =>
    points
        .slice(1)
        .reduce(
            (total, point, index) =>
                total + getManhattanDistance(points[index], point),
            0
        );

const simplifyPoints = (points: RoutePoint[]) => {
    const deduped = points.filter(
        (point, index) =>
            index === 0 || !arePointsEqual(point, points[index - 1])
    );

    if (deduped.length <= 2) {
        return deduped;
    }

    const simplified: RoutePoint[] = [deduped[0]];

    for (let index = 1; index < deduped.length - 1; index += 1) {
        const previous = simplified[simplified.length - 1];
        const current = deduped[index];
        const next = deduped[index + 1];
        const isVertical = previous.x === current.x && current.x === next.x;
        const isHorizontal = previous.y === current.y && current.y === next.y;

        if (!isVertical && !isHorizontal) {
            simplified.push(current);
        }
    }

    simplified.push(deduped[deduped.length - 1]);
    return simplified;
};

const getPolylineMidpoint = (points: RoutePoint[]): RoutePoint => {
    if (points.length === 0) {
        return { x: 0, y: 0 };
    }

    if (points.length === 1) {
        return points[0];
    }

    const lengths = points
        .slice(1)
        .map((point, index) => getManhattanDistance(points[index], point));
    const totalLength = lengths.reduce((sum, value) => sum + value, 0);
    const targetLength = totalLength / 2;
    let traversed = 0;

    for (let index = 0; index < lengths.length; index += 1) {
        const length = lengths[index];
        const start = points[index];
        const end = points[index + 1];

        if (traversed + length >= targetLength) {
            const ratio =
                length === 0 ? 0 : (targetLength - traversed) / length;
            return {
                x: start.x + (end.x - start.x) * ratio,
                y: start.y + (end.y - start.y) * ratio,
            };
        }

        traversed += length;
    }

    return points[points.length - 1];
};

const getHorizontalExitPoint = ({
    point,
    side,
    turnIndex,
}: {
    point: RoutePoint;
    side: Side;
    turnIndex: number;
}) => ({
    x:
        point.x +
        (side === 'right'
            ? TABLE_KEEP_OUT_MARGIN + EXIT_DISTANCE * (turnIndex + 1)
            : -(TABLE_KEEP_OUT_MARGIN + EXIT_DISTANCE * (turnIndex + 1))),
    y: point.y,
});

const getTurnLaneAssignments = (endpoints: RelationshipEndpoint[]) => {
    const assignments = new Map<string, number>();
    const groupsBySide = new Map<string, RelationshipEndpoint[]>();

    endpoints.forEach((endpoint) => {
        const key = `${endpoint.tableId}:${endpoint.side}`;
        const group = groupsBySide.get(key) ?? [];
        group.push(endpoint);
        groupsBySide.set(key, group);
    });

    groupsBySide.forEach((groupEndpoints) => {
        const fieldGroups = new Map<string, RelationshipEndpoint[]>();

        groupEndpoints.forEach((endpoint) => {
            const fieldGroup = fieldGroups.get(endpoint.fieldId) ?? [];
            fieldGroup.push(endpoint);
            fieldGroups.set(endpoint.fieldId, fieldGroup);
        });

        Array.from(fieldGroups.values())
            .sort((first, second) => {
                const firstY =
                    first.reduce((sum, endpoint) => sum + endpoint.y, 0) /
                    first.length;
                const secondY =
                    second.reduce((sum, endpoint) => sum + endpoint.y, 0) /
                    second.length;

                return firstY - secondY;
            })
            .forEach((fieldGroup, index) => {
                fieldGroup.forEach((endpoint) => {
                    assignments.set(getEndpointKey(endpoint), index);
                });
            });
    });

    return assignments;
};

const doesSegmentIntersectRect = ({
    from,
    to,
    rect,
}: {
    from: RoutePoint;
    to: RoutePoint;
    rect: Rect;
}) => {
    if (from.x === to.x) {
        const x = from.x;
        const minY = Math.min(from.y, to.y);
        const maxY = Math.max(from.y, to.y);

        return (
            x > rect.left &&
            x < rect.right &&
            maxY > rect.top &&
            minY < rect.bottom
        );
    }

    if (from.y === to.y) {
        const y = from.y;
        const minX = Math.min(from.x, to.x);
        const maxX = Math.max(from.x, to.x);

        return (
            y > rect.top &&
            y < rect.bottom &&
            maxX > rect.left &&
            minX < rect.right
        );
    }

    return false;
};

const routeCrossesKeepOuts = ({
    points,
    keepOutRects,
}: {
    points: RoutePoint[];
    keepOutRects: Rect[];
}) => {
    for (let index = 1; index < points.length - 2; index += 1) {
        const from = points[index];
        const to = points[index + 1];

        if (
            keepOutRects.some((rect) =>
                doesSegmentIntersectRect({
                    from,
                    to,
                    rect,
                })
            )
        ) {
            return true;
        }
    }

    return false;
};

const isOutwardFromSource = ({
    sourcePoint,
    sourceSide,
    nextPoint,
}: {
    sourcePoint: RoutePoint;
    sourceSide: Side;
    nextPoint: RoutePoint;
}) =>
    sourceSide === 'left'
        ? nextPoint.x <= sourcePoint.x
        : nextPoint.x >= sourcePoint.x;

const isInwardToTarget = ({
    targetPoint,
    targetSide,
    previousPoint,
}: {
    targetPoint: RoutePoint;
    targetSide: Side;
    previousPoint: RoutePoint;
}) =>
    targetSide === 'left'
        ? previousPoint.x <= targetPoint.x
        : previousPoint.x >= targetPoint.x;

const getCandidateMidYs = ({
    preferredMidY,
    keepOutRects,
}: {
    preferredMidY: number;
    keepOutRects: Rect[];
}) => {
    const candidates = new Set<number>([preferredMidY]);

    keepOutRects.forEach((rect) => {
        candidates.add(rect.top - KEEP_OUT_LANE_GAP);
        candidates.add(rect.bottom + KEEP_OUT_LANE_GAP);
    });

    return Array.from(candidates).sort(
        (first, second) =>
            Math.abs(first - preferredMidY) - Math.abs(second - preferredMidY)
    );
};

const buildSelfRelationshipRoute = ({
    sourcePoint,
    targetPoint,
    keepOutRect,
    sourceTurnIndex,
    targetTurnIndex,
}: {
    sourcePoint: RoutePoint;
    targetPoint: RoutePoint;
    keepOutRect: Rect;
    sourceTurnIndex: number;
    targetTurnIndex: number;
}) => {
    const topY = Math.min(
        keepOutRect.top - KEEP_OUT_LANE_GAP,
        Math.min(sourcePoint.y, targetPoint.y) - SELF_RELATION_GAP
    );
    const sourceExit = {
        x: keepOutRect.right + EXIT_DISTANCE * (sourceTurnIndex + 1),
        y: sourcePoint.y,
    };
    const targetExit = {
        x: keepOutRect.left - EXIT_DISTANCE * (targetTurnIndex + 1),
        y: targetPoint.y,
    };

    return simplifyPoints([
        sourcePoint,
        sourceExit,
        { x: sourceExit.x, y: topY },
        { x: targetExit.x, y: topY },
        targetExit,
        targetPoint,
    ]);
};

const buildSimpleRoute = ({
    sourcePoint,
    targetPoint,
    sourceSide,
    targetSide,
    sameTable,
    sourceKeepOutRect,
    keepOutRects,
    sourceTurnIndex,
    targetTurnIndex,
}: {
    sourcePoint: RoutePoint;
    targetPoint: RoutePoint;
    sourceSide: Side;
    targetSide: Side;
    sameTable: boolean;
    sourceKeepOutRect: Rect;
    keepOutRects: Rect[];
    sourceTurnIndex: number;
    targetTurnIndex: number;
}) => {
    if (sameTable) {
        return buildSelfRelationshipRoute({
            sourcePoint,
            targetPoint,
            keepOutRect: sourceKeepOutRect,
            sourceTurnIndex,
            targetTurnIndex,
        });
    }

    const sourceExit = getHorizontalExitPoint({
        point: sourcePoint,
        side: sourceSide,
        turnIndex: sourceTurnIndex,
    });
    const targetExit = getHorizontalExitPoint({
        point: targetPoint,
        side: targetSide,
        turnIndex: targetTurnIndex,
    });
    const shortRouteCandidates: RoutePoint[][] = [];

    if (
        isInwardToTarget({
            targetPoint,
            targetSide,
            previousPoint: sourceExit,
        })
    ) {
        shortRouteCandidates.push(
            simplifyPoints([
                sourcePoint,
                sourceExit,
                { x: sourceExit.x, y: targetPoint.y },
                targetPoint,
            ])
        );
    }

    if (
        isOutwardFromSource({
            sourcePoint,
            sourceSide,
            nextPoint: targetExit,
        })
    ) {
        shortRouteCandidates.push(
            simplifyPoints([
                sourcePoint,
                { x: targetExit.x, y: sourcePoint.y },
                targetExit,
                targetPoint,
            ])
        );
    }

    const validShortRoute = shortRouteCandidates
        .filter(
            (route) =>
                !routeCrossesKeepOuts({
                    points: route,
                    keepOutRects,
                })
        )
        .sort(
            (first, second) => getPathLength(first) - getPathLength(second)
        )[0];

    if (validShortRoute) {
        return validShortRoute;
    }

    const preferredMidY = (sourceExit.y + targetExit.y) / 2;
    const candidateMidYs = getCandidateMidYs({
        preferredMidY,
        keepOutRects,
    });

    for (const midY of candidateMidYs) {
        const route = simplifyPoints([
            sourcePoint,
            sourceExit,
            { x: sourceExit.x, y: midY },
            { x: targetExit.x, y: midY },
            targetExit,
            targetPoint,
        ]);

        if (
            !routeCrossesKeepOuts({
                points: route,
                keepOutRects,
            })
        ) {
            return route;
        }
    }

    return simplifyPoints([
        sourcePoint,
        sourceExit,
        { x: sourceExit.x, y: preferredMidY },
        { x: targetExit.x, y: preferredMidY },
        targetExit,
        targetPoint,
    ]);
};

export const buildRelationshipRoutes = ({
    relationships,
    tables,
    obstacleTableIds: _obstacleTableIds,
}: {
    relationships: DBRelationship[];
    tables: DBTable[];
    obstacleTableIds?: Set<string>;
}) => {
    void _obstacleTableIds;

    const tableMap = new Map(tables.map((table) => [table.id, table]));
    const keepOutRectsByTableId = new Map(
        tables.map((table) => [table.id, getKeepOutRect(table)])
    );
    const relatedFieldIdsByTable = new Map<string, Set<string>>();
    const relationshipMetadata: Array<{
        relationship: DBRelationship;
        sourceTable: DBTable;
        targetTable: DBTable;
        sourceSide: Side;
        targetSide: Side;
        sourceY: number;
        targetY: number;
    }> = [];

    relationships.forEach((relationship) => {
        const sourceSet =
            relatedFieldIdsByTable.get(relationship.sourceTableId) ??
            new Set<string>();
        sourceSet.add(relationship.sourceFieldId);
        relatedFieldIdsByTable.set(relationship.sourceTableId, sourceSet);

        const targetSet =
            relatedFieldIdsByTable.get(relationship.targetTableId) ??
            new Set<string>();
        targetSet.add(relationship.targetFieldId);
        relatedFieldIdsByTable.set(relationship.targetTableId, targetSet);
    });

    relationships.forEach((relationship) => {
        const sourceTable = tableMap.get(relationship.sourceTableId);
        const targetTable = tableMap.get(relationship.targetTableId);

        if (!sourceTable || !targetTable) {
            return;
        }

        const sourceWidth = getTableDimensions(sourceTable).width;
        const targetWidth = getTableDimensions(targetTable).width;
        const sameTable =
            relationship.sourceTableId === relationship.targetTableId;
        const sourceCenterX = sourceTable.x + sourceWidth / 2;
        const targetCenterX = targetTable.x + targetWidth / 2;
        const sourceSide: Side = sameTable
            ? 'right'
            : targetCenterX >= sourceCenterX
              ? 'right'
              : 'left';
        const targetSide: Side = sameTable
            ? 'left'
            : sourceSide === 'right'
              ? 'left'
              : 'right';

        relationshipMetadata.push({
            relationship,
            sourceTable,
            targetTable,
            sourceSide,
            targetSide,
            sourceY: getFieldAnchorY({
                table: sourceTable,
                fieldId: relationship.sourceFieldId,
                relatedFieldIds:
                    relatedFieldIdsByTable.get(sourceTable.id) ??
                    new Set<string>(),
            }),
            targetY: getFieldAnchorY({
                table: targetTable,
                fieldId: relationship.targetFieldId,
                relatedFieldIds:
                    relatedFieldIdsByTable.get(targetTable.id) ??
                    new Set<string>(),
            }),
        });
    });

    const turnLaneAssignments = getTurnLaneAssignments(
        relationshipMetadata.flatMap(
            ({ relationship, sourceSide, targetSide, sourceY, targetY }) => [
                {
                    relationshipId: relationship.id,
                    kind: 'source' as const,
                    tableId: relationship.sourceTableId,
                    fieldId: relationship.sourceFieldId,
                    side: sourceSide,
                    y: sourceY,
                },
                {
                    relationshipId: relationship.id,
                    kind: 'target' as const,
                    tableId: relationship.targetTableId,
                    fieldId: relationship.targetFieldId,
                    side: targetSide,
                    y: targetY,
                },
            ]
        )
    );

    const routes = new Map<string, RelationshipRoute>();

    relationshipMetadata.forEach(
        ({
            relationship,
            sourceTable,
            targetTable,
            sourceSide,
            targetSide,
            sourceY,
            targetY,
        }) => {
            const sourceKeepOutRect = keepOutRectsByTableId.get(sourceTable.id);
            const targetKeepOutRect = keepOutRectsByTableId.get(targetTable.id);

            if (!sourceKeepOutRect || !targetKeepOutRect) {
                return;
            }

            const sourceWidth = getTableDimensions(sourceTable).width;
            const targetWidth = getTableDimensions(targetTable).width;
            const sameTable =
                relationship.sourceTableId === relationship.targetTableId;
            const sourceTurnIndex =
                turnLaneAssignments.get(
                    getEndpointKey({
                        relationshipId: relationship.id,
                        kind: 'source',
                    })
                ) ?? 0;
            const targetTurnIndex =
                turnLaneAssignments.get(
                    getEndpointKey({
                        relationshipId: relationship.id,
                        kind: 'target',
                    })
                ) ?? 0;

            const sourcePoint: RoutePoint = {
                x:
                    sourceSide === 'left'
                        ? sourceTable.x
                        : sourceTable.x + sourceWidth,
                y: sourceY,
            };
            const targetPoint: RoutePoint = {
                x:
                    targetSide === 'left'
                        ? targetTable.x
                        : targetTable.x + targetWidth,
                y: targetY,
            };

            const points = buildSimpleRoute({
                sourcePoint,
                targetPoint,
                sourceSide,
                targetSide,
                sameTable,
                sourceKeepOutRect,
                keepOutRects: Array.from(keepOutRectsByTableId.values()),
                sourceTurnIndex,
                targetTurnIndex,
            });

            routes.set(relationship.id, {
                points,
                sourceSide,
                targetSide,
                midpoint: getPolylineMidpoint(points),
            });
        }
    );

    return routes;
};
