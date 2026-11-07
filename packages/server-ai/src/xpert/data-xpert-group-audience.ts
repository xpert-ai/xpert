import { businessAreaAccessSql } from '@xpert-ai/server-core'
import type { SelectQueryBuilder } from 'typeorm'
import { activeSharingMemberSql } from './sharing/sharing-policy'
import type { Xpert } from './xpert.entity'

/** DataXpert's selected organization groups bound the audience of its managed assistants. */
export function applyDataXpertGroupAudience(
    query: SelectQueryBuilder<Xpert>,
    tenantId: string,
    organizationId: string | null,
    userId: string | null,
    canManageAreas: boolean
) {
    const assignedGroups = `FROM xpert_to_user_group assignment
        JOIN user_group audience_group ON audience_group.id = assignment."userGroupId"
        WHERE assignment."xpertId" = xpert.id AND audience_group."managedBy" IS NULL`
    const domain = businessAreaAccessSql(
        'xpert."businessAreaId"',
        ':audienceTenant',
        ':audienceOrg',
        ':audienceUser',
        'view',
        canManageAreas
    )
    query.andWhere(
        `(
        (xpert.options::jsonb -> 'dataXpert' ->> 'managedBy') IS DISTINCT FROM 'data-xpert'
        OR (COALESCE(xpert.options::jsonb -> 'dataXpert' ->> 'requireUserGroup', 'false') <> 'true'
            AND NOT EXISTS (SELECT 1 ${assignedGroups}))
        OR (
            xpert."tenantId" = :audienceTenant AND xpert."organizationId" = :audienceOrg
            AND EXISTS (SELECT 1 ${assignedGroups}
                AND audience_group."tenantId" = :audienceTenant AND audience_group."organizationId" = :audienceOrg
                AND EXISTS (SELECT 1 FROM user_group_to_user membership
                    WHERE membership."userGroupId" = audience_group.id AND membership."userId" = :audienceUser))
            AND ${activeSharingMemberSql(':audienceUser', ':audienceTenant', ':audienceOrg')}
            AND (xpert."businessAreaId" IS NULL OR ${domain})
        )
    )`,
        { audienceTenant: tenantId, audienceOrg: organizationId, audienceUser: userId }
    )
}
