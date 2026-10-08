import { Command, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { DataSource, EntityManager, In } from 'typeorm'
import { AgentRuntimeDelivery, AgentRuntimeInbox } from './runtime-message.entity'
import { RuntimeMessageAccessService } from './runtime-message-access.service'

/** Retry delivery to the pinned owner; this never clears stop barriers or replays a consumed result. */
export class RequestRuntimeResultCheckCommand extends Command<void> {
    constructor(
        readonly invocationId: string,
        readonly owner: { tenantId: string; organizationId: string; ownerId: string }
    ) {
        super()
    }
}

/** The caller must authorize the pinned recipient before entering this transaction. */
export async function resetRuntimeDelivery(
    manager: EntityManager,
    invocationId: string,
    owner: RequestRuntimeResultCheckCommand['owner']
) {
    await manager
        .getRepository(AgentRuntimeDelivery)
        .update(
            { ...owner, invocationId, state: In(['blocked', 'failed']) },
            { state: 'pending', attempts: 0, nextAttemptAt: new Date(), lastError: null }
        )
    await manager
        .getRepository(AgentRuntimeInbox)
        .createQueryBuilder()
        .update()
        .set({ state: 'pending', attempts: 0, nextAttemptAt: new Date(), lastError: null })
        .where({ ...owner, invocationId, state: In(['blocked', 'failed']) })
        .andWhere("event->>'kind' = 'result'")
        .execute()
}

@CommandHandler(RequestRuntimeResultCheckCommand)
export class RequestRuntimeResultCheckHandler implements ICommandHandler<RequestRuntimeResultCheckCommand> {
    constructor(
        private readonly database: DataSource,
        private readonly access: RuntimeMessageAccessService
    ) {}
    async execute(command: RequestRuntimeResultCheckCommand) {
        await this.access.withReply(command.invocationId, command.owner, async () => {
            await this.database.transaction((manager) =>
                resetRuntimeDelivery(manager, command.invocationId, command.owner)
            )
        })
    }
}
