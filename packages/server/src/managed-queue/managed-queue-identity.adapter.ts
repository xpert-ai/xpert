// Delegated users retain their credential audience; technical actors never become
// ordinary human identities. Actorless maintenance jobs grant no user authority.
import { Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { UserType } from '@xpert-ai/contracts'
import { ExecutionUserLoader } from '../user/execution-identity/execution-user-loader'
import { executionIdentityError } from '../user/execution-identity/execution-identity'
import { ResolveExecutionIdentityCommand } from '../user/execution-identity/resolve-execution-identity.command'
import { ExecutionContextReadyService } from '../user/execution-identity/execution-context-lifecycle.module'

@Injectable()
export class ManagedQueueIdentityAdapter {
	constructor(
		private readonly users: ExecutionUserLoader,
		private readonly commands: CommandBus,
		private readonly readiness: ExecutionContextReadyService
	) {}

	async resolve(userId: string, tenantId: string, organizationId?: string) {
		await this.readiness.waitUntilReady()
		const user = await this.users.load(userId, tenantId)
		if (!user || user.id !== userId || user.tenantId !== tenantId || user.isActive === false)
			throw executionIdentityError()
		if (user.type === UserType.USER) {
			return (
				await this.commands.execute(
					new ResolveExecutionIdentityCommand({
						tenantId,
						organizationId,
						userId,
						kind: 'user'
					})
				)
			).user
		}
		if (user.type !== UserType.COMMUNICATION) throw executionIdentityError()
		// Technical accounts retain their persisted delegation; resource domains authorize their bindings.
		return user
	}
}
