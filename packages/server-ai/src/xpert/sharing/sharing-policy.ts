import { UserGroupManagedByEnum, UserGroupManagedEntityTypeEnum } from '@xpert-ai/contracts'
// Runtime grants are valid only while the recipient remains an active organization member.
export const activeSharingMemberSql = (user: string, tenant: string, organization: string) => `EXISTS (
    SELECT 1 FROM user_organization sharing_membership
    INNER JOIN "user" sharing_user ON sharing_user.id = sharing_membership."userId"
    WHERE sharing_membership."userId" = ${user}
      AND sharing_membership."tenantId" = ${tenant}
      AND sharing_membership."organizationId" = ${organization}
      AND sharing_membership."isActive" = true
      AND sharing_user."tenantId" = ${tenant} AND sharing_user."deletedAt" IS NULL
)`

/** Internal grants belong to one Assistant family, even if an old import copied a relation. */
export const validSharingGroupSql = (group: string, assistant: string) => `(
    "${group}"."managedBy" IS NULL OR (
        "${group}"."managedBy" IN ('${UserGroupManagedByEnum.XPERT_SHARING}', '${UserGroupManagedByEnum.XPERT_MARKETPLACE}')
        AND "${group}"."managedEntityType" = '${UserGroupManagedEntityTypeEnum.XPERT}'
        AND EXISTS (SELECT 1 FROM xpert sharing_owner
            WHERE sharing_owner.id = "${group}"."managedEntityId"
              AND sharing_owner."tenantId" = "${assistant}"."tenantId"
              AND sharing_owner."organizationId" IS NOT DISTINCT FROM "${assistant}"."organizationId"
              AND (sharing_owner.id = "${assistant}".id OR (
                  NULLIF(sharing_owner.slug, '') IS NOT NULL AND sharing_owner.slug = "${assistant}".slug
                  AND sharing_owner.type = "${assistant}".type
                  AND sharing_owner."workspaceId" IS NOT DISTINCT FROM "${assistant}"."workspaceId"
              ))
        )
    )
)`
