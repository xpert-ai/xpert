// Add only newly introduced grants. Existing disabled grants are explicit revocations.
import { AIPermissionsEnum, IRole, IRolePermission } from '@xpert-ai/contracts'
import { Repository } from 'typeorm'
import { Role } from '../role/role.entity'
import { RolePermission } from './role-permission.entity'
import { DEFAULT_ROLE_PERMISSIONS } from './default-role-permissions'

const introduced = [
	AIPermissionsEnum.XPERT_WORKSPACE_MANAGE,
	AIPermissionsEnum.XPERT_VIEW,
	AIPermissionsEnum.APPLICATION_USE,
	AIPermissionsEnum.APPLICATION_INSTALL
]

export function missingApplicationPermissions(roles: IRole[], grants: IRolePermission[]) {
	return roles.flatMap((role) => {
		const existing = grants.filter((grant) => grant.roleId === role.id && grant.tenantId === role.tenantId)
		const defaults: readonly string[] =
			DEFAULT_ROLE_PERMISSIONS.find((preset) => preset.role === role.name)?.defaultEnabledPermissions ?? []
		const authoringRevoked = existing.some(
			(grant) => grant.permission === AIPermissionsEnum.XPERT_EDIT && !grant.enabled
		)
		return introduced
			.filter(
				(permission) =>
					!existing.some((grant) => grant.permission === permission) &&
					(!authoringRevoked || permission === AIPermissionsEnum.APPLICATION_USE) &&
					(defaults.includes(permission) ||
						(permission === AIPermissionsEnum.XPERT_VIEW &&
							existing.some(
								(grant) => grant.permission === AIPermissionsEnum.XPERT_EDIT && grant.enabled
							)))
			)
			.map((permission) => ({ roleId: role.id, tenantId: role.tenantId, permission, enabled: true }))
	})
}

export async function upgradeApplicationPermissions(repository: Repository<RolePermission>) {
	await repository.manager.transaction(async (manager) => {
		if (manager.connection.options.type === 'postgres')
			await manager.query("SELECT pg_advisory_xact_lock(hashtextextended('xpert-application-permissions-v1', 0))")
		const roles = await manager.getRepository(Role).find()
		const permissions = manager.getRepository(RolePermission)
		const missing = missingApplicationPermissions(roles, await permissions.find())
		if (missing.length) await permissions.save(missing)
	})
}
