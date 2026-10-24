import type { IRolePermission } from '@xpert-ai/contracts'

/** Empty, disabled and out-of-scope grants never acquire role-template defaults. */
export function effectiveRolePermissions(
	grants: readonly IRolePermission[],
	tenantId: string,
	roleId: string
): IRolePermission['permission'][] {
	const scoped = grants.filter((grant) => grant.tenantId === tenantId && grant.roleId === roleId)
	const denied = new Set(scoped.filter((grant) => !grant.enabled).map((grant) => grant.permission))
	return [
		...new Set(
			scoped.filter((grant) => grant.enabled && !denied.has(grant.permission)).map((grant) => grant.permission)
		)
	].sort()
}
