// Cancellation invalidates the durable continuation claim, not the underlying domain task.
import { CommandHandler, ICommandHandler, IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { AgentInvocationWaitStore } from './invocation-wait.store'

export class CancelTaskWaitsCommand {
    constructor(
        readonly executionIds: string[],
        readonly currentThreadId?: string
    ) {}
}
export class CheckTaskWaitClaimQuery {
    constructor(
        readonly id: string,
        readonly leaseToken: string,
        readonly threadId: string
    ) {}
}

@CommandHandler(CancelTaskWaitsCommand)
export class CancelTaskWaitsHandler implements ICommandHandler<CancelTaskWaitsCommand> {
    constructor(private readonly waits: AgentInvocationWaitStore) {}
    async execute(command: CancelTaskWaitsCommand) {
        await this.waits.records.query(
            `UPDATE agent_invocation_wait AS wait
            SET state = 'stale', "leaseToken" = NULL, "leaseUntil" = NULL, "lastError" = 'parent_cancelled'
            FROM xpert_agent_execution AS execution
            WHERE execution.id = ANY($1::uuid[]) AND wait."tenantId" = execution."tenantId"
            AND wait."organizationId" = execution."organizationId" AND wait."ownerId" = execution."createdById"::text
            AND wait.state IN ('waiting', 'ready', 'blocked')
            AND ((wait.request->'scope'->>'parentExecutionId') = execution.id::text
                OR (wait."threadId" = $2 AND execution."threadId" = $2)
                OR wait.id IN (SELECT id FROM agent_invocation WHERE invocation->'scope'->>'parentExecutionId' = execution.id::text))`,
            [command.executionIds, command.currentThreadId ?? null]
        )
    }
}

@QueryHandler(CheckTaskWaitClaimQuery)
export class CheckTaskWaitClaimHandler implements IQueryHandler<CheckTaskWaitClaimQuery> {
    constructor(private readonly waits: AgentInvocationWaitStore) {}
    async execute(query: CheckTaskWaitClaimQuery) {
        const row = await this.waits.records.findOneBy({
            id: query.id,
            leaseToken: query.leaseToken,
            threadId: query.threadId,
            state: 'ready'
        })
        return !!row && !!row.leaseUntil && row.leaseUntil.getTime() > Date.now()
    }
}
