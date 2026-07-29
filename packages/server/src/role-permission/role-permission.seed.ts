import { IRole, ITenant, IRolePermission, PermissionsEnum } from '@xpert-ai/contracts'
import { Connection } from 'typeorm'
import { Role } from '../core/entities/internal'
import { DEFAULT_ROLE_PERMISSIONS } from './default-role-permissions'
import { RolePermission } from './role-permission.entity'

export const createRolePermissions = async (
	connection: Connection,
	roles: IRole[],
	tenants: ITenant[],
	isDemo: boolean
): Promise<IRolePermission[]> => {
	// removed permissions for all users in DEMO mode
	const deniedPermissions = new Set<string>([
		PermissionsEnum.ACCESS_DELETE_ACCOUNT,
		PermissionsEnum.ACCESS_DELETE_ALL_DATA
	])

	const rolePermissions: IRolePermission[] = []
	for (const tenant of tenants) {
		DEFAULT_ROLE_PERMISSIONS.forEach(({ role: roleEnum, defaultEnabledPermissions }) => {
			const role = roles.find((dbRole) => dbRole.name === roleEnum && dbRole.tenant.name === tenant.name)
			if (role) {
				defaultEnabledPermissions
					.filter((permission) => !isDemo || !deniedPermissions.has(permission))
					.forEach((permission) => {
						const rolePermission = new RolePermission()
						rolePermission.role = role as Role
						rolePermission.permission = permission
						rolePermission.enabled = true
						rolePermission.tenant = tenant

						rolePermissions.push(rolePermission)
					})
			}
		})
	}

	return await connection.manager.save(rolePermissions)
}

export const cleanUpRolePermissions = async (
	connection: Connection,
	roles: IRole[],
	tenants: ITenant[],
	isDemo: boolean
) => {
	for (const tenant of tenants) {
		for (const role of roles) {
			await connection.manager.delete(RolePermission, {
				tenant,
				role
			})
		}
	}
}
