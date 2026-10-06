// A committed claim reserves one execution. After `started`, recovery observes that execution only;
// an ambiguous model run is never replayed as a new turn, even after a lease expires.
import { sameInvocationData } from '../../agent-invocation/invocation-runtime'
import { t } from 'i18next'
import { Injectable, Logger } from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import { CommandBus } from '@nestjs/cqrs'
import { DataSource, In, LessThanOrEqual } from 'typeorm'
import { randomUUID } from 'node:crypto'
import { lastValueFrom } from 'rxjs'
import { AgentRuntimeResultClaim, agentRuntimeEventSchema, agentRuntimeResultClaimSchema } from '@xpert-ai/plugin-sdk'
import { TChatMessageEnvelope, XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { AgentRuntimeInbox } from './runtime-message.entity'
import { AuthorizedRuntimeReply, RuntimeMessageAccessService } from './runtime-message-access.service'
import { ChatConversationThread } from '../../chat-conversation/conversation-thread.entity'
import { lockRuntimeThread } from '../../chat-conversation/chat-execution-admission.service'
import { XpertAgentExecution } from '../../xpert-agent-execution/agent-execution.entity'
import { ChatCommonCommand } from '../../chat/commands/chat-common.command'
import { XpertChatCommand } from '../../xpert/commands/chat.command'
import { isRuntimeMessageBlocked, runtimeMessageError } from './runtime-message.errors'

export function runtimeReplyBlocked(thread: ChatConversationThread, invocationCreatedAt: string): string | null {
    if (
        thread.runtimeContinuationBlockedAt &&
        thread.runtimeContinuationBlockedAt.getTime() >= Date.parse(invocationCreatedAt)
    )
        return 'user_stopped'
    if (
        ['paused', 'pausing', 'interrupted'].includes(thread.status) ||
        thread.operation ||
        thread.runControl?.state === 'paused'
    )
        return 'awaiting_user'
    return null
}

@Injectable()
export class RuntimeMessageContinuationService {
    private scanning = false
    private readonly logger = new Logger(RuntimeMessageContinuationService.name)
    constructor(
        private readonly dataSource: DataSource,
        private readonly access: RuntimeMessageAccessService,
        private readonly commands: CommandBus
    ) {}

    @Interval(3000)
    async reconcile() {
        if (this.scanning) return
        this.scanning = true
        try {
            const rows = await this.dataSource.getRepository(AgentRuntimeInbox).find({
                where: { state: In(['pending', 'processing']), nextAttemptAt: LessThanOrEqual(new Date()) },
                order: { nextAttemptAt: 'ASC' },
                take: 8
            })
            await Promise.allSettled(rows.map((row) => this.consume(row)))
        } catch {
            this.logger.warn('Runtime consumption scan deferred')
        } finally {
            this.scanning = false
        }
    }

    async consume(row: AgentRuntimeInbox) {
        const repo = this.dataSource.getRepository(AgentRuntimeInbox)
        const leaseToken = randomUUID()
        const leased = await repo
            .createQueryBuilder()
            .update()
            .set({ leaseToken, leaseUntil: new Date(Date.now() + 60_000) })
            .where({ id: row.id, state: In(['pending', 'processing']) })
            .andWhere('("leaseUntil" IS NULL OR "leaseUntil" < now())')
            .execute()
        if (!leased.affected) return
        const owned = { id: row.id, leaseToken }
        const heartbeat = setInterval(() => {
            void repo
                .update(owned, { leaseUntil: new Date(Date.now() + 60_000) })
                .catch(() => this.logger.warn('Runtime consumption lease refresh deferred'))
        }, 15_000)
        try {
            await this.access.withReply(row.invocationId, row, async (reply) => {
                const reservation = await this.reserve(row.id, leaseToken, reply)
                if (!reservation) return
                if (reservation.phase === 'started') {
                    await this.recover(reservation)
                    return
                }
                const claim = agentRuntimeResultClaimSchema.parse(reservation.claim)
                const started = await repo.update(
                    { ...owned, phase: 'reserved', state: 'processing' },
                    { phase: 'started' }
                )
                if (!started.affected) return
                await this.run(reply, reservation, claim)
                await this.recover(reservation)
            })
        } catch (error) {
            const current = await repo.findOneBy(owned)
            if (current?.phase === 'started') {
                await this.recover(current)
            } else if (current?.state !== 'processed') {
                const access = isRuntimeMessageBlocked(error)
                await repo.update(owned, {
                    state: access ? 'blocked' : current?.attempts >= 19 ? 'failed' : 'pending',
                    lastError: access ? 'access_or_target_changed' : 'continuation_unavailable',
                    attempts: (current?.attempts ?? 0) + 1,
                    nextAttemptAt: new Date(Date.now() + 30_000)
                })
            }
        } finally {
            clearInterval(heartbeat)
            await this.releaseUnusedReservation(row.id, leaseToken)
            await repo.update(owned, { leaseToken: null, leaseUntil: null })
        }
    }

    private async reserve(id: string, leaseToken: string, reply: AuthorizedRuntimeReply) {
        return this.dataSource.transaction(async (manager) => {
            const repo = manager.getRepository(AgentRuntimeInbox)
            const inbox = await repo.findOne({ where: { id, leaseToken }, lock: { mode: 'pessimistic_write' } })
            if (!inbox || inbox.state === 'processed') return null
            const event = agentRuntimeEventSchema.parse(inbox.event)
            if (event.kind !== 'result') return null
            if (
                event.invocationId !== reply.invocation.id ||
                event.status !== reply.invocation.status ||
                event.revision > reply.invocation.revision
            )
                throw runtimeMessageError('Invalid')
            const previous = inbox.claim ? agentRuntimeResultClaimSchema.parse(inbox.claim) : null
            if (
                previous &&
                (previous.invocationId !== event.invocationId ||
                    previous.resultRevision !== event.revision ||
                    !sameInvocationData(previous.recipient, reply.dispatch.replyTo))
            )
                throw runtimeMessageError('Invalid')
            if (inbox.phase === 'started') return inbox
            const thread = await lockRuntimeThread(manager, reply.conversation, reply.dispatch.replyTo.threadId)
            const blocked = runtimeReplyBlocked(thread, reply.parentCreatedAt)
            if (blocked) {
                await repo.update(id, { state: 'blocked', lastError: blocked })
                return null
            }
            if (previous?.consumer.type === 'wait') return null
            if (
                (thread.runControl && thread.runControl.executionId !== previous?.consumer.executionId) ||
                (!thread.runControl && thread.status === 'busy')
            ) {
                await repo.update(id, { nextAttemptAt: new Date(Date.now() + 5000), lastError: 'thread_busy' })
                return null
            }
            const executionId = previous?.consumer.executionId ?? randomUUID()
            const claim: AgentRuntimeResultClaim = previous ?? {
                invocationId: inbox.invocationId,
                resultRevision: inbox.event.revision,
                recipient: reply.dispatch.replyTo,
                consumer: { type: 'follow_up', executionId }
            }
            const target = reply.dispatch.replyTo
            await manager
                .getRepository(XpertAgentExecution)
                .createQueryBuilder()
                .insert()
                .values({
                    id: executionId,
                    tenantId: inbox.tenantId,
                    organizationId: inbox.organizationId,
                    createdById: inbox.ownerId,
                    threadId: target.threadId,
                    agentKey: target.agentKey,
                    xpertId: target.type === 'project_agent' ? null : target.xpertId,
                    type: target.type === 'project_agent' ? 'project_agent' : 'agent',
                    status: XpertAgentExecutionStatusEnum.PENDING
                })
                .orIgnore()
                .execute()
            thread.runControl = { executionId, state: 'running' }
            thread.status = 'busy'
            await manager.save(thread)
            inbox.claim = claim
            inbox.state = 'processing'
            inbox.phase = 'reserved'
            inbox.lastError = null
            return repo.save(inbox)
        })
    }

    private async run(reply: AuthorizedRuntimeReply, inbox: AgentRuntimeInbox, claim: AgentRuntimeResultClaim) {
        const { invocation, dispatch, user } = reply
        const target = dispatch.replyTo
        // This is host-authored control text containing validated identifiers only. Executor output is fetched as tool data.
        const input =
            t('server-ai:RuntimeReply.Completed', { invocationId: invocation.id }) +
            (dispatch.projectTask
                ? t('server-ai:RuntimeReply.ProjectTask', {
                      taskId: dispatch.projectTask.projectTaskId,
                      attemptId: dispatch.projectTask.taskExecutionId
                  })
                : '')
        const messageEnvelope: TChatMessageEnvelope = {
            version: 1,
            source: {
                type: 'runtime',
                provider: invocation.request.target.provider,
                bindingId: invocation.request.target.bindingId,
                invocationId: invocation.id
            },
            presentation: 'runtime',
            correlation: {
                messageId: inbox.messageId,
                replyToMessageId: dispatch.sourceMessageId,
                invocationId: invocation.id,
                executionId: claim.consumer.executionId,
                projectTaskId: dispatch.projectTask?.projectTaskId,
                taskExecutionId: dispatch.projectTask?.taskExecutionId
            }
        }
        const request = {
            action: 'send' as const,
            conversationId: target.conversationId,
            projectId: invocation.scope.projectId,
            message: { input: { input } }
        }
        const stream =
            target.type === 'project_agent'
                ? await this.commands.execute(
                      new ChatCommonCommand(request, {
                          tenantId: invocation.scope.tenantId,
                          organizationId: invocation.scope.organizationId,
                          user,
                          execution: { id: claim.consumer.executionId },
                          messageEnvelope
                      })
                  )
                : await this.commands.execute(
                      new XpertChatCommand(request, {
                          xpertId: target.xpertId,
                          agentKey: target.agentKey,
                          threadId: target.threadId,
                          execution: { id: claim.consumer.executionId },
                          messageEnvelope
                      })
                  )
        await lastValueFrom(stream, { defaultValue: undefined })
    }

    private async releaseUnusedReservation(id: string, leaseToken: string) {
        await this.dataSource.transaction(async (manager) => {
            const inbox = await manager
                .getRepository(AgentRuntimeInbox)
                .findOne({ where: { id, leaseToken }, lock: { mode: 'pessimistic_write' } })
            if (inbox?.phase !== 'reserved' || !['blocked', 'failed'].includes(inbox.state)) return
            const parsed = agentRuntimeResultClaimSchema.safeParse(inbox.claim)
            if (!parsed.success || parsed.data.consumer.type !== 'follow_up') return
            const thread = await manager.getRepository(ChatConversationThread).findOne({
                where: {
                    threadId: parsed.data.recipient.threadId,
                    tenantId: inbox.tenantId,
                    organizationId: inbox.organizationId
                },
                lock: { mode: 'pessimistic_write' }
            })
            if (
                thread?.runControl?.executionId !== parsed.data.consumer.executionId ||
                thread.runControl.state !== 'running' ||
                thread.status !== 'busy'
            )
                return
            thread.runControl = null
            thread.status = thread.operation ? 'interrupted' : 'idle'
            await manager.save(thread)
        })
    }

    private async recover(inbox: AgentRuntimeInbox) {
        const parsed = agentRuntimeResultClaimSchema.safeParse(inbox.claim)
        if (!parsed.success) throw runtimeMessageError('Invalid')
        const execution = await this.dataSource.getRepository(XpertAgentExecution).findOneBy({
            id: parsed.data.consumer.executionId,
            tenantId: inbox.tenantId,
            organizationId: inbox.organizationId,
            createdById: inbox.ownerId
        })
        const finished =
            execution &&
            [
                XpertAgentExecutionStatusEnum.SUCCESS,
                XpertAgentExecutionStatusEnum.ERROR,
                XpertAgentExecutionStatusEnum.TIMEOUT,
                XpertAgentExecutionStatusEnum.INTERRUPTED
            ].includes(execution.status)
        await this.dataSource.transaction(async (manager) => {
            const updated = await manager.getRepository(AgentRuntimeInbox).update(
                { id: inbox.id, leaseToken: inbox.leaseToken },
                {
                    state: finished ? 'processed' : 'blocked',
                    lastError: finished
                        ? execution.status === XpertAgentExecutionStatusEnum.SUCCESS
                            ? null
                            : 'consumer_ended_without_success'
                        : 'consumer_outcome_unknown'
                }
            )
            if (!updated.affected || !finished) return
            const thread = await manager.getRepository(ChatConversationThread).findOne({
                where: {
                    threadId: parsed.data.recipient.threadId,
                    tenantId: inbox.tenantId,
                    organizationId: inbox.organizationId
                },
                lock: { mode: 'pessimistic_write' }
            })
            // Repair a crash after execution finalization, without touching a later writer or a user pause/stop.
            if (
                thread?.runControl?.executionId !== execution.id ||
                thread.runControl.state !== 'running' ||
                thread.status !== 'busy'
            )
                return
            thread.runControl = null
            thread.encryptedRunContext = null
            thread.operation = execution.operation ?? thread.operation ?? null
            thread.status =
                thread.operation || execution.status === XpertAgentExecutionStatusEnum.INTERRUPTED
                    ? 'interrupted'
                    : execution.status === XpertAgentExecutionStatusEnum.SUCCESS
                      ? 'idle'
                      : 'error'
            thread.error = execution.error ?? null
            await manager.save(thread)
        })
    }
}
