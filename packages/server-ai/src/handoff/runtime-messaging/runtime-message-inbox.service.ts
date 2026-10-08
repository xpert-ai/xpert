// Invariants: receipt and acknowledgement commit together; wait and follow-up contend on the same row.
// Only references to an existing outbox event may enter the inbox. Payloads cannot choose a recipient.
import { Injectable } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { DataSource, EntityManager } from 'typeorm'
import { randomUUID } from 'node:crypto'
import {
    AgentRuntimeEvent,
    AgentRuntimeResultClaim,
    HandoffMessage,
    agentRuntimeEventSchema,
    agentRuntimeResultConsumptionKey,
    agentRuntimeEventMessageId
} from '@xpert-ai/plugin-sdk'
import { XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { sameInvocationData } from '../../agent-invocation/invocation-runtime'
import { XpertAgentExecution } from '../../xpert-agent-execution/agent-execution.entity'
import { AgentRuntimeDelivery, AgentRuntimeInbox } from './runtime-message.entity'
import { AuthorizedRuntimeReply, RuntimeMessageAccessService } from './runtime-message-access.service'
import { runtimeMessageError } from './runtime-message.errors'
import { ClaimAgentRuntimeResultsCommand } from './runtime-message.commands'
import { runtimeObservationEvent } from './runtime-message-outbox'

@Injectable()
export class RuntimeMessageInboxService {
    constructor(
        private readonly dataSource: DataSource,
        private readonly access: RuntimeMessageAccessService
    ) {}

    async receive(message: HandoffMessage): Promise<void> {
        if (!message.tenantId || !message.headers?.organizationId || !message.headers?.userId)
            throw runtimeMessageError('Invalid')
        const parsed = agentRuntimeEventSchema.safeParse(message.payload)
        if (!parsed.success) throw runtimeMessageError('Invalid')
        const event = parsed.data
        const delivery = await this.dataSource.getRepository(AgentRuntimeDelivery).findOneBy({
            messageId: message.id,
            tenantId: message.tenantId,
            organizationId: message.headers?.organizationId,
            ownerId: message.headers?.userId
        })
        if (!delivery || !sameInvocationData(delivery.event, event) || message.id !== agentRuntimeEventMessageId(event))
            throw runtimeMessageError('Invalid')
        await this.access.withReply(event.invocationId, delivery, async (reply) => {
            if (
                message.sessionKey !== reply.dispatch.replyTo.threadId ||
                message.headers?.conversationId !== reply.dispatch.replyTo.conversationId ||
                message.headers?.threadId !== reply.dispatch.replyTo.threadId
            )
                throw runtimeMessageError('Access')
            await this.dataSource.transaction(async (manager) => {
                await this.lockInbox(manager, reply, event)
                if (event.kind === 'result') {
                    await manager
                        .getRepository(AgentRuntimeInbox)
                        .createQueryBuilder()
                        .update()
                        .set({ state: 'processed', lastError: 'superseded' })
                        .where({
                            invocationId: event.invocationId,
                            tenantId: delivery.tenantId,
                            organizationId: delivery.organizationId,
                            ownerId: delivery.ownerId
                        })
                        .andWhere("event->>'kind' = 'input_request'")
                        .execute()
                }
                await manager.getRepository(AgentRuntimeDelivery).update(delivery.id, {
                    state: 'received',
                    leaseToken: null,
                    leaseUntil: null,
                    lastError: null
                })
            })
        })
    }

    async lockInbox(
        manager: EntityManager,
        reply: AuthorizedRuntimeReply,
        event: AgentRuntimeEvent
    ): Promise<AgentRuntimeInbox> {
        const scope = reply.invocation.scope
        const key = agentRuntimeResultConsumptionKey(event.invocationId, reply.dispatch.replyTo)
        // Input requests have independent receipts and never compete with the final-result claim.
        const consumptionKey = event.kind === 'input_request' ? `${key}:input:${event.interactionId}` : key
        const where = {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            ownerId: scope.userId,
            consumptionKey
        }
        const supersededInput =
            event.kind === 'input_request' &&
            (reply.invocation.status !== 'waiting' || reply.invocation.interaction?.id !== event.interactionId)
        const repo = manager.getRepository(AgentRuntimeInbox)
        await repo
            .createQueryBuilder()
            .insert()
            .values({
                ...where,
                id: randomUUID(),
                invocationId: event.invocationId,
                messageId: agentRuntimeEventMessageId(event),
                event: () => ':event::jsonb',
                state: event.kind === 'result' ? 'pending' : supersededInput ? 'processed' : 'blocked',
                lastError: supersededInput ? 'superseded' : event.kind === 'input_request' ? 'awaiting_input' : null
            })
            .setParameters({ event: JSON.stringify(event) })
            .orIgnore()
            .execute()
        const inbox = await repo.findOne({ where, lock: { mode: 'pessimistic_write' } })
        if (!inbox) throw runtimeMessageError('Invalid')
        return inbox
    }

    async claimWait(command: ClaimAgentRuntimeResultsCommand): Promise<void> {
        const { scope, callId } = command
        for (const id of command.invocationIds) {
            await this.access.withReply(
                id,
                { tenantId: scope.tenantId, organizationId: scope.organizationId, ownerId: scope.userId },
                async (reply) => {
                    const original = reply.invocation.scope
                    if (!sameInvocationData({ ...original, parentExecutionId: scope.parentExecutionId }, scope))
                        throw runtimeMessageError('Access')
                    const event = runtimeObservationEvent(reply.invocation)
                    if (event?.kind !== 'result') return
                    await this.dataSource.transaction(async (manager) => {
                        const consumer = await manager.getRepository(XpertAgentExecution).findOneBy({
                            id: scope.parentExecutionId,
                            tenantId: scope.tenantId,
                            organizationId: scope.organizationId,
                            createdById: scope.userId,
                            threadId: reply.dispatch.replyTo.threadId,
                            agentKey: scope.callerAgentKey,
                            status: XpertAgentExecutionStatusEnum.RUNNING
                        })
                        if (!consumer) throw runtimeMessageError('Access')
                        const inbox = await this.lockInbox(manager, reply, event)
                        const claim: AgentRuntimeResultClaim = {
                            invocationId: id,
                            resultRevision: event.revision,
                            recipient: reply.dispatch.replyTo,
                            consumer: { type: 'wait', executionId: scope.parentExecutionId, callId }
                        }
                        if (inbox.claim && !sameInvocationData(inbox.claim, claim))
                            throw runtimeMessageError('Consumed')
                        await manager
                            .getRepository(AgentRuntimeInbox)
                            .createQueryBuilder()
                            .update()
                            .set({
                                state: 'processed',
                                claim: () => ':claim::jsonb',
                                lastError: null
                            })
                            .where({ id: inbox.id })
                            .setParameters({ claim: JSON.stringify(claim) })
                            .execute()
                    })
                }
            )
        }
    }
}

@CommandHandler(ClaimAgentRuntimeResultsCommand)
export class ClaimAgentRuntimeResultsHandler implements ICommandHandler<ClaimAgentRuntimeResultsCommand> {
    constructor(private readonly inbox: RuntimeMessageInboxService) {}
    execute(command: ClaimAgentRuntimeResultsCommand) {
        return this.inbox.claimWait(command)
    }
}
