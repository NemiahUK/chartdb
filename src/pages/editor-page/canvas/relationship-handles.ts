import type { DBRelationship } from '@/lib/domain/db-relationship';

export const LEFT_HANDLE_ID_PREFIX = 'left_rel_';
export const RIGHT_HANDLE_ID_PREFIX = 'right_rel_';
export const TARGET_ID_PREFIX = 'target_rel_';

export const getRelationshipSourceHandleId = ({
    fieldId,
    side = 'left',
}: {
    fieldId: string;
    side?: 'left' | 'right';
}) =>
    `${side === 'right' ? RIGHT_HANDLE_ID_PREFIX : LEFT_HANDLE_ID_PREFIX}${fieldId}`;

export const getRelationshipTargetHandleId = (fieldId: string) =>
    `${TARGET_ID_PREFIX}${fieldId}`;

export const getRelationshipEdgeHandleIds = (
    relationship: Pick<DBRelationship, 'sourceFieldId' | 'targetFieldId'>
) => ({
    sourceHandle: getRelationshipSourceHandleId({
        fieldId: relationship.sourceFieldId,
        side: 'left',
    }),
    targetHandle: getRelationshipTargetHandleId(relationship.targetFieldId),
});
