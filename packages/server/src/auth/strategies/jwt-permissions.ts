import type { IUser } from '@xpert-ai/contracts'

/** Token claims may narrow current grants, but cannot restore a revoked database permission. */
export function applyTokenPermissionCeiling(user: IUser, permissions?: string[] | null) {
	if (!user.role || !Array.isArray(permissions)) return
	const allowed = new Set(permissions)
	user.role = {
		...user.role,
		rolePermissions: (user.role.rolePermissions ?? []).filter((grant) => allowed.has(grant.permission))
	}
}
