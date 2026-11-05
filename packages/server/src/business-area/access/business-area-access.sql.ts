import type { TBusinessAreaAction } from '@xpert-ai/contracts'

/** Arguments are trusted SQL expressions from host code, never request values. Bind actor values as query parameters. */
export function businessAreaAccessSql(
	area: string,
	tenant: string,
	organization: string,
	user: string,
	action: TBusinessAreaAction = 'view',
	platformManagement = false
): string {
	if (platformManagement)
		return `EXISTS (
        SELECT 1 FROM business_area managed_area
        INNER JOIN user_organization managed_membership ON managed_membership."userId" = ${user}
            AND managed_membership."tenantId" = managed_area."tenantId" AND managed_membership."organizationId" = managed_area."organizationId" AND managed_membership."isActive" = true
        INNER JOIN "user" managed_user ON managed_user.id = managed_membership."userId" AND managed_user."deletedAt" IS NULL AND managed_user."isActive" = true
        WHERE managed_area.id = ${area} AND managed_area."tenantId" = ${tenant} AND managed_area."organizationId" = ${organization}
    )`
	const roles =
		action === 'manage'
			? "'domain_admin'"
			: action === 'publish'
				? "'publisher', 'domain_admin'"
				: "'consumer', 'publisher', 'domain_admin'"
	return `EXISTS (
        SELECT 1 FROM business_area_access_grant bag
        INNER JOIN user_organization bao ON bao."userId" = ${user}
            AND bao."tenantId" = bag."tenantId" AND bao."organizationId" = bag."organizationId" AND bao."isActive" = true
        INNER JOIN "user" bau ON bau.id = bao."userId" AND bau."tenantId" = bag."tenantId" AND bau."deletedAt" IS NULL AND bau."isActive" = true
        WHERE bag."businessAreaId" = ${area} AND bag."tenantId" = ${tenant} AND bag."organizationId" = ${organization}
          AND bag.role IN (${roles}) AND (
            (bag."subjectType" = 'user' AND bag."userId" = ${user}) OR
            (bag."subjectType" = 'user_group' AND EXISTS (
                SELECT 1 FROM user_group bagroup INNER JOIN user_group_to_user bagmember ON bagmember."userGroupId" = bagroup.id
                WHERE bagroup.id = bag."userGroupId" AND bagroup."tenantId" = bag."tenantId"
                  AND bagroup."organizationId" = bag."organizationId" AND bagroup."managedBy" IS NULL AND bagmember."userId" = ${user}
            ))
          )
    )`
}
