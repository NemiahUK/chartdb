import React, { useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { Edge, EdgeProps } from '@xyflow/react';
import type { DBRelationship, Cardinality } from '@/lib/domain/db-relationship';
import { useChartDB } from '@/hooks/use-chartdb';
import { cn } from '@/lib/utils';
import { getCardinalityMarkerId } from '../canvas-utils';
import { useDiff } from '@/context/diff-context/use-diff';
import { useCanvas } from '@/hooks/use-canvas';
import { EditRelationshipPopover } from './edit-relationship-popover';
import { EllipsisIcon } from 'lucide-react';
import type { RelationshipRoute, RoutePoint } from '../relationship-router';

export type RelationshipEdgeType = Edge<
    {
        relationship: DBRelationship;
        route?: RelationshipRoute;
        highlighted?: boolean;
    },
    'relationship-edge'
>;

const buildRoundedPath = (points: RoutePoint[]) => {
    if (points.length === 0) {
        return '';
    }

    if (points.length === 1) {
        return `M ${points[0].x} ${points[0].y}`;
    }

    const radius = 14;
    let path = `M ${points[0].x} ${points[0].y}`;

    for (let index = 1; index < points.length - 1; index += 1) {
        const previous = points[index - 1];
        const current = points[index];
        const next = points[index + 1];
        const incomingLength =
            Math.abs(current.x - previous.x) + Math.abs(current.y - previous.y);
        const outgoingLength =
            Math.abs(next.x - current.x) + Math.abs(next.y - current.y);
        const cornerRadius = Math.min(
            radius,
            incomingLength / 2,
            outgoingLength / 2
        );

        const cornerStart =
            previous.x === current.x
                ? {
                      x: current.x,
                      y:
                          current.y -
                          Math.sign(current.y - previous.y) * cornerRadius,
                  }
                : {
                      x:
                          current.x -
                          Math.sign(current.x - previous.x) * cornerRadius,
                      y: current.y,
                  };
        const cornerEnd =
            current.x === next.x
                ? {
                      x: current.x,
                      y:
                          current.y +
                          Math.sign(next.y - current.y) * cornerRadius,
                  }
                : {
                      x:
                          current.x +
                          Math.sign(next.x - current.x) * cornerRadius,
                      y: current.y,
                  };

        path += ` L ${cornerStart.x} ${cornerStart.y}`;
        path += ` Q ${current.x} ${current.y} ${cornerEnd.x} ${cornerEnd.y}`;
    }

    const lastPoint = points[points.length - 1];
    path += ` L ${lastPoint.x} ${lastPoint.y}`;
    return path;
};

export const RelationshipEdge: React.FC<EdgeProps<RelationshipEdgeType>> =
    React.memo(({ id, selected, data }) => {
        const { checkIfRelationshipRemoved, checkIfNewRelationship } =
            useDiff();

        const { updateRelationship, removeRelationship } = useChartDB();
        const {
            editRelationshipPopover,
            openRelationshipPopover,
            closeRelationshipPopover,
        } = useCanvas();

        const relationship = data?.relationship;

        const isPopoverOpen = useMemo(
            () => editRelationshipPopover?.relationshipId === id,
            [editRelationshipPopover, id]
        );

        const handleEdgeClick = useCallback(
            (e: React.MouseEvent) => {
                if (e.detail === 2) {
                    // Double click - open popover
                    openRelationshipPopover({
                        relationshipId: id,
                        position: { x: e.clientX, y: e.clientY },
                    });
                }
                // Single click just selects the edge, doesn't open popover
            },
            [openRelationshipPopover, id]
        );

        const handleContextMenu = useCallback(
            (e: React.MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                openRelationshipPopover({
                    relationshipId: id,
                    position: { x: e.clientX, y: e.clientY },
                });
            },
            [id, openRelationshipPopover]
        );

        const handleIndicatorClick = useCallback(
            (e: React.MouseEvent) => {
                e.stopPropagation();
                openRelationshipPopover({
                    relationshipId: id,
                    position: { x: e.clientX, y: e.clientY },
                });
            },
            [id, openRelationshipPopover]
        );

        const handleSwitchTables = useCallback(async () => {
            if (!relationship) return;

            const sameCardinality =
                relationship.sourceCardinality ===
                relationship.targetCardinality;

            if (sameCardinality) {
                // Equal cardinalities: swap everything (tables, fields, schemas, cardinalities)
                await updateRelationship(
                    id,
                    {
                        sourceSchema: relationship.targetSchema,
                        targetSchema: relationship.sourceSchema,
                        sourceTableId: relationship.targetTableId,
                        targetTableId: relationship.sourceTableId,
                        sourceFieldId: relationship.targetFieldId,
                        targetFieldId: relationship.sourceFieldId,
                        sourceCardinality: relationship.targetCardinality,
                        targetCardinality: relationship.sourceCardinality,
                    },
                    { updateHistory: true }
                );
            } else if (relationship.sourceCardinality === 'many') {
                // many:one → one:many (swap cardinalities so "many" moves to target)
                await updateRelationship(
                    id,
                    {
                        sourceCardinality: 'one',
                        targetCardinality: 'many',
                    },
                    { updateHistory: true }
                );
            } else {
                // one:many → swap tables/fields/schemas (keeps one:many with different tables)
                await updateRelationship(
                    id,
                    {
                        sourceSchema: relationship.targetSchema,
                        targetSchema: relationship.sourceSchema,
                        sourceTableId: relationship.targetTableId,
                        targetTableId: relationship.sourceTableId,
                        sourceFieldId: relationship.targetFieldId,
                        targetFieldId: relationship.sourceFieldId,
                    },
                    { updateHistory: true }
                );
            }

            closeRelationshipPopover();
        }, [id, relationship, updateRelationship, closeRelationshipPopover]);

        const handleCardinalityChange = useCallback(
            async (
                newSourceCardinality: Cardinality,
                newTargetCardinality: Cardinality
            ) => {
                if (!relationship) return;

                // Ensure "many" is always on target side when cardinalities differ
                // If trying to set many:one (N:1), swap tables and set one:many
                if (
                    newSourceCardinality === 'many' &&
                    newTargetCardinality === 'one'
                ) {
                    await updateRelationship(
                        id,
                        {
                            // Swap tables/fields/schemas
                            sourceSchema: relationship.targetSchema,
                            targetSchema: relationship.sourceSchema,
                            sourceTableId: relationship.targetTableId,
                            targetTableId: relationship.sourceTableId,
                            sourceFieldId: relationship.targetFieldId,
                            targetFieldId: relationship.sourceFieldId,
                            // Set one:many (many on target)
                            sourceCardinality: 'one',
                            targetCardinality: 'many',
                        },
                        { updateHistory: true }
                    );
                } else {
                    await updateRelationship(
                        id,
                        {
                            sourceCardinality: newSourceCardinality,
                            targetCardinality: newTargetCardinality,
                        },
                        { updateHistory: true }
                    );
                }
                closeRelationshipPopover();
            },
            [id, relationship, updateRelationship, closeRelationshipPopover]
        );

        const handleDelete = useCallback(() => {
            removeRelationship(id, { updateHistory: true });
            closeRelationshipPopover();
        }, [id, removeRelationship, closeRelationshipPopover]);
        const route = data?.route;
        const isHighlighted = data?.highlighted ?? false;
        const isActive = selected || isHighlighted;
        const sourceSide = route?.sourceSide ?? 'left';
        const targetSide = route?.targetSide ?? 'left';

        const edgePath = useMemo(
            () => buildRoundedPath(route?.points ?? []),
            [route?.points]
        );

        const sourceMarker = useMemo(
            () =>
                getCardinalityMarkerId({
                    cardinality: relationship?.sourceCardinality ?? 'one',
                    selected: isActive,
                    side: sourceSide as 'left' | 'right',
                }),
            [relationship?.sourceCardinality, isActive, sourceSide]
        );
        const targetMarker = useMemo(
            () =>
                getCardinalityMarkerId({
                    cardinality: relationship?.targetCardinality ?? 'one',
                    selected: isActive,
                    side: targetSide as 'left' | 'right',
                }),
            [relationship?.targetCardinality, isActive, targetSide]
        );

        const isDiffNewRelationship = useMemo(
            () =>
                relationship?.id
                    ? checkIfNewRelationship({
                          relationshipId: relationship.id,
                      })
                    : false,
            [checkIfNewRelationship, relationship?.id]
        );

        const isDiffRelationshipRemoved = useMemo(
            () =>
                relationship?.id
                    ? checkIfRelationshipRemoved({
                          relationshipId: relationship.id,
                      })
                    : false,
            [checkIfRelationshipRemoved, relationship?.id]
        );

        // Calculate the midpoint of the edge for the indicator
        const edgeMidpoint = useMemo(() => {
            return route?.midpoint ?? { x: 0, y: 0 };
        }, [route?.midpoint]);

        return (
            <>
                <path
                    id={id}
                    d={edgePath}
                    markerStart={`url(#${sourceMarker})`}
                    markerEnd={`url(#${targetMarker})`}
                    fill="none"
                    className={cn([
                        'react-flow__edge-path',
                        isActive
                            ? '!stroke-pink-600 !stroke-[2.5px]'
                            : '!stroke-slate-400 !stroke-2',
                        {
                            '!stroke-green-500 !stroke-[3px]':
                                isDiffNewRelationship,
                            '!stroke-red-500 !stroke-[3px]':
                                isDiffRelationshipRemoved,
                        },
                    ])}
                    onClick={handleEdgeClick}
                    onContextMenu={handleContextMenu}
                />
                <path
                    d={edgePath}
                    fill="none"
                    strokeOpacity={0}
                    strokeWidth={20}
                    // eslint-disable-next-line tailwindcss/no-custom-classname
                    className="react-flow__edge-interaction"
                    onClick={handleEdgeClick}
                    onContextMenu={handleContextMenu}
                />
                {selected && (
                    <foreignObject
                        width={24}
                        height={24}
                        x={edgeMidpoint.x - 12}
                        y={edgeMidpoint.y - 12}
                        className="overflow-visible"
                        style={{ pointerEvents: 'all' }}
                    >
                        <button
                            onClick={handleIndicatorClick}
                            className="relative flex size-6 items-center justify-center rounded-full border-2 border-pink-600 bg-background shadow-lg transition-all hover:scale-110 hover:bg-pink-50"
                            title="Edit relationship"
                            style={{ zIndex: 10 }}
                        >
                            <EllipsisIcon className="size-4 text-pink-600" />
                        </button>
                    </foreignObject>
                )}
                {relationship &&
                    isPopoverOpen &&
                    editRelationshipPopover?.position &&
                    createPortal(
                        <EditRelationshipPopover
                            anchorPosition={editRelationshipPopover.position}
                            relationshipId={id}
                            sourceCardinality={
                                relationship.sourceCardinality ?? 'one'
                            }
                            targetCardinality={
                                relationship.targetCardinality ?? 'one'
                            }
                            onCardinalityChange={handleCardinalityChange}
                            onSwitch={handleSwitchTables}
                            onDelete={handleDelete}
                        />,
                        document.body
                    )}
            </>
            // <BaseEdge
            //     id={id}
            //     path={edgePath}
            //     markerStart="url(#cardinality_one)"
            //     markerEnd="url(#cardinality_one)"
            //     className={`!stroke-2 ${selected ? '!stroke-slate-500' : '!stroke-slate-300'}`}
            // />
        );
    });

RelationshipEdge.displayName = 'RelationshipEdge';
