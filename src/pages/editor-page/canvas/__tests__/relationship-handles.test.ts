import type { DBRelationship } from '@/lib/domain/db-relationship';
import {
    getRelationshipEdgeHandleIds,
    getRelationshipSourceHandleId,
    getRelationshipTargetHandleId,
} from '../relationship-handles';

describe('relationship handle ids', () => {
    it('builds stable source and target handle ids for an edge', () => {
        const relationship = {
            sourceFieldId: 'site-id-field',
            targetFieldId: 'org-site-id-field',
        } satisfies Pick<DBRelationship, 'sourceFieldId' | 'targetFieldId'>;

        expect(getRelationshipEdgeHandleIds(relationship)).toEqual({
            sourceHandle: 'left_rel_site-id-field',
            targetHandle: 'target_rel_org-site-id-field',
        });
    });

    it('reuses the same target handle id for multiple relationships to the same field', () => {
        const relationships = [
            {
                sourceFieldId: 'site-id-field',
                targetFieldId: 'org-site-id-field',
            },
            {
                sourceFieldId: 'site-id-field',
                targetFieldId: 'org-site-id-field',
            },
        ] satisfies Array<
            Pick<DBRelationship, 'sourceFieldId' | 'targetFieldId'>
        >;

        const targetHandles = relationships.map(
            (relationship) => getRelationshipEdgeHandleIds(relationship).targetHandle
        );

        expect(targetHandles).toEqual([
            'target_rel_org-site-id-field',
            'target_rel_org-site-id-field',
        ]);
    });

    it('does not encode per-edge indexes into field handle ids', () => {
        expect(getRelationshipTargetHandleId('field-123')).toBe(
            'target_rel_field-123'
        );
        expect(
            getRelationshipSourceHandleId({
                fieldId: 'field-123',
                side: 'right',
            })
        ).toBe('right_rel_field-123');
        expect(
            getRelationshipTargetHandleId('field-123')
        ).not.toMatch(/^target_rel_\d+_/);
    });
});