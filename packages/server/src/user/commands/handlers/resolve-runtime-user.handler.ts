import { ForbiddenException } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { UserType, type IUser } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { User } from '../../user.entity'
import { ResolveRuntimeUserCommand } from '../resolve-runtime-user.command'

@CommandHandler(ResolveRuntimeUserCommand)
export class ResolveRuntimeUserHandler implements ICommandHandler<ResolveRuntimeUserCommand> {
	constructor(@InjectRepository(User) private readonly users: Repository<User>) {}
	async execute(command: ResolveRuntimeUserCommand): Promise<IUser & { id: string; tenantId: string }> {
		const deny = () =>
			new ForbiddenException(
				t('server-ai:Error.RuntimeUserUnavailable', { defaultValue: 'Runtime user is unavailable' })
			)
		if (
			!command.tenantId ||
			!command.userId ||
			command.tenantId !== RequestContext.currentTenantId() ||
			command.userId !== RequestContext.currentUserId() ||
			(command.organizationId ?? null) !== RequestContext.getOrganizationId()
		)
			throw deny()
		const user = await this.users.findOne({
			where: { id: command.userId, tenantId: command.tenantId },
			relations: ['role', 'role.rolePermissions', 'organizations'],
			select: {
				id: true,
				tenantId: true,
				type: true,
				roleId: true,
				role: { id: true, name: true, rolePermissions: { id: true, permission: true, enabled: true } },
				organizations: { id: true, organizationId: true, tenantId: true, isActive: true }
			}
		})
		if (
			!user ||
			user.type !== UserType.USER ||
			(command.organizationId &&
				!user.organizations?.some(
					(item) =>
						item.tenantId === command.tenantId &&
						item.organizationId === command.organizationId &&
						item.isActive
				))
		)
			throw deny()
		return { id: user.id, tenantId: user.tenantId, type: user.type, roleId: user.roleId, role: user.role }
	}
}
