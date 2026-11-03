import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { IUser } from '@xpert-ai/contracts'
import { Repository } from 'typeorm'
import { User } from '../user.entity'
import { executionIdentityError } from './execution-identity'

/** Credential-free user projection shared by authenticated execution boundaries. */
export function projectExecutionUser(user: IUser): IUser {
	if ((user.roleId && !user.role) || (user.role && !Array.isArray(user.role.rolePermissions)))
		throw executionIdentityError(true)
	return {
		id: user.id,
		tenantId: user.tenantId,
		type: user.type,
		isActive: user.isActive,
		roleId: user.roleId,
		preferredLanguage: user.preferredLanguage,
		firstName: user.firstName,
		lastName: user.lastName,
		username: user.username,
		email: user.email,
		employeeId: user.employeeId ?? user.employee?.id,
		role: user.role
			? {
					id: user.role.id,
					tenantId: user.role.tenantId,
					name: user.role.name,
					rolePermissions: user.role.rolePermissions.map((grant) => ({
						id: grant.id,
						tenantId: grant.tenantId,
						roleId: grant.roleId,
						permission: grant.permission,
						enabled: grant.enabled,
						role: { id: user.role.id, tenantId: user.role.tenantId, name: user.role.name }
					}))
				}
			: null
	}
}

@Injectable()
export class ExecutionUserLoader {
	constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

	async load(userId: string, tenantId: string): Promise<IUser | null> {
		if (!userId?.trim() || !tenantId?.trim()) return null
		const user = await this.users.findOne({
			where: { id: userId, tenantId },
			relations: ['role', 'role.rolePermissions', 'employee'],
			select: {
				id: true,
				tenantId: true,
				type: true,
				isActive: true,
				roleId: true,
				preferredLanguage: true,
				firstName: true,
				lastName: true,
				username: true,
				email: true,
				employee: { id: true },
				role: {
					id: true,
					tenantId: true,
					name: true,
					rolePermissions: { id: true, tenantId: true, roleId: true, permission: true, enabled: true }
				}
			}
		})
		return user ? projectExecutionUser(user) : null
	}
}
