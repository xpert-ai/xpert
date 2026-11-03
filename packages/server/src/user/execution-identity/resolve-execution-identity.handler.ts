import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { UserType } from '@xpert-ai/contracts'
import { ResolveUserOrganizationAccessCommand } from '../../user-organization/commands/resolve-user-organization-access.command'
import { createExecutionIdentity, executionIdentityError } from './execution-identity'
import { ExecutionUserLoader, projectExecutionUser } from './execution-user-loader'
import { ResolveExecutionIdentityCommand } from './resolve-execution-identity.command'

@CommandHandler(ResolveExecutionIdentityCommand)
export class ResolveExecutionIdentityHandler implements ICommandHandler<ResolveExecutionIdentityCommand> {
	constructor(
		private readonly users: ExecutionUserLoader,
		private readonly commands: CommandBus
	) {}

	async execute({ actor }: ResolveExecutionIdentityCommand) {
		if (
			!actor.tenantId?.trim() ||
			!actor.userId?.trim() ||
			(actor.organizationId != null && !actor.organizationId.trim()) ||
			!['user', 'service'].includes(actor.kind)
		)
			throw executionIdentityError()
		const user = actor.organizationId
			? await this.commands.execute(
					new ResolveUserOrganizationAccessCommand({
						tenantId: actor.tenantId,
						organizationId: actor.organizationId,
						userId: actor.userId,
						allowServiceAccounts: actor.kind === 'service'
					})
				)
			: await this.users.load(actor.userId, actor.tenantId)
		if (
			!user ||
			user.isActive === false ||
			user.type !== (actor.kind === 'user' ? UserType.USER : UserType.COMMUNICATION)
		)
			throw executionIdentityError()
		return createExecutionIdentity(projectExecutionUser(user), actor)
	}
}
