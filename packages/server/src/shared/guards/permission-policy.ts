import { AIPermissionsEnum, type IUser } from '@xpert-ai/contracts'
import { assistantRuntimeCredential } from '../../api-key/assistant-runtime-compatibility'

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

/** Do not reload role grants here. Assistant runtime compatibility still requires domain audience/ACL checks. */
export function evaluatePermissions(
	user: IUser | null | undefined,
	permissions: readonly string[] | undefined
): PermissionDecision {
	if (permissions === undefined) return { allowed: true }
	if (!permissions.length) return { allowed: false, reason: 'permission_declaration_empty' }
	const credential = assistantRuntimeCredential(user)
	if (credential)
		return credential.allowed && permissions.length === 1 && permissions[0] === AIPermissionsEnum.CHAT_VIEW
			? { allowed: true }
			: { allowed: false, reason: 'permission_missing' }
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
