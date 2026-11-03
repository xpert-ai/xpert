import { ForbiddenException } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { type IUser } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { ResolveExecutionIdentityCommand } from '../../execution-identity/resolve-execution-identity.command'
import { ResolveRuntimeUserCommand } from '../resolve-runtime-user.command'

@CommandHandler(ResolveRuntimeUserCommand)
export class ResolveRuntimeUserHandler implements ICommandHandler<ResolveRuntimeUserCommand> {
	constructor(private readonly commands: CommandBus) {}
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
		const { user } = await this.commands.execute(
			new ResolveExecutionIdentityCommand({
				tenantId: command.tenantId,
				organizationId: command.organizationId,
				userId: command.userId,
				kind: 'user'
			})
		)
		return { ...user, id: command.userId, tenantId: command.tenantId }
	}
}
