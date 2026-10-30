import type { IUser } from '@xpert-ai/contracts'

export type PermissionDecision =
	| { allowed: true }
	| {
			allowed: false
			reason:
				| 'identity_invalid'
				| 'permission_declaration_empty'
				| 'permissions_unavailable'
				| 'permission_missing'
	  }

/** Use only authentication's effective grants. Reloading here could restore permissions excluded by a token. */
export function evaluatePermissions(
	user: IUser | null | undefined,
	permissions: readonly string[] | undefined
): PermissionDecision {
	if (permissions === undefined) return { allowed: true }
	if (!permissions.length) return { allowed: false, reason: 'permission_declaration_empty' }
	const roleId = user?.roleId ?? user?.role?.id
	if (!user?.id || !user.tenantId || !roleId || user.isActive === false)
		return { allowed: false, reason: 'identity_invalid' }
	const grants = user.role?.rolePermissions
	if (!grants) return { allowed: false, reason: 'permissions_unavailable' }
	return grants.some(
		(grant) =>
			grant.enabled &&
			grant.tenantId === user.tenantId &&
			grant.roleId === roleId &&
			permissions.includes(grant.permission)
	)
		? { allowed: true }
		: { allowed: false, reason: 'permission_missing' }
}
