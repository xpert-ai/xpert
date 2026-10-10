import { isRuntimeMessageBlocked } from './runtime-message.errors'
import { HandoffOutboxAdapters } from '../outbox-adapters.service'
import { Injectable, Logger } from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import { DataSource, LessThanOrEqual } from 'typeorm'
import { randomUUID } from 'node:crypto'
import { AGENT_RUNTIME_EVENT_MESSAGE_TYPE, agentRuntimeEventSchema, HandoffMessage } from '@xpert-ai/plugin-sdk'
import { HandoffQueueService } from '../message-queue.service'
import { AgentRuntimeDelivery } from './runtime-message.entity'
import { RuntimeMessageAccessService } from './runtime-message-access.service'

@Injectable()
export class RuntimeMessageTransportService {
    private readonly logger = new Logger(RuntimeMessageTransportService.name)
    private scanning = false
    constructor(
        private readonly dataSource: DataSource,
        private readonly access: RuntimeMessageAccessService,
        private readonly queue: HandoffQueueService,
        private readonly adapters: HandoffOutboxAdapters
    ) {}

    @Interval(5000)
    async reconcile() {
        if (this.scanning) return
        this.scanning = true
        try {
            const rows = await this.dataSource.getRepository(AgentRuntimeDelivery).find({
                where: { state: 'pending', nextAttemptAt: LessThanOrEqual(new Date()) },
                order: { nextAttemptAt: 'ASC' },
                take: 20
            })
            await Promise.allSettled(rows.map((row) => this.deliver(row)))
        } catch {
            this.logger.warn('Runtime delivery scan deferred')
        } finally {
            try {
                // Feature outboxes reuse this scan and the existing Handoff queue.
                await this.adapters.reconcile()
            } finally {
                this.scanning = false
            }
        }
    }

    async deliver(row: AgentRuntimeDelivery) {
        const repo = this.dataSource.getRepository(AgentRuntimeDelivery)
        const leaseToken = randomUUID()
        const owned = { id: row.id, leaseToken, state: 'pending' as const }
        const claim = await repo
            .createQueryBuilder()
            .update()
            .set({ leaseToken, leaseUntil: new Date(Date.now() + 60_000), attempts: () => 'attempts + 1' })
            .where({ id: row.id, state: 'pending' })
            .andWhere('("leaseUntil" IS NULL OR "leaseUntil" < now())')
            .execute()
        if (!claim.affected) return
        try {
            const event = agentRuntimeEventSchema.parse(row.event)
            await this.access.withReply(row.invocationId, row, async ({ invocation, dispatch }) => {
                const message: HandoffMessage = {
                    id: row.messageId,
                    type: AGENT_RUNTIME_EVENT_MESSAGE_TYPE,
                    version: 1,
                    tenantId: row.tenantId,
                    sessionKey: dispatch.replyTo.threadId,
                    businessKey: invocation.id,
                    attempt: 1,
                    maxAttempts: 5,
                    enqueuedAt: Date.now(),
                    traceId: invocation.id,
                    parentMessageId: dispatch.sourceMessageId,
                    payload: event,
                    headers: {
                        organizationId: row.organizationId,
                        userId: row.ownerId,
                        conversationId: dispatch.replyTo.conversationId,
                        threadId: dispatch.replyTo.threadId
                    }
                }
                await this.queue.enqueue(message)
            })
            // Enqueue is not receipt acknowledgement. Resend the same id until inbox commits received.
            await repo.update(owned, { nextAttemptAt: new Date(Date.now() + 30_000), lastError: null })
        } catch (error) {
            const denied = isRuntimeMessageBlocked(error)
            await repo.update(owned, {
                state: denied ? 'blocked' : row.attempts >= 19 ? 'failed' : 'pending',
                lastError: denied ? 'access_or_target_changed' : 'transport_unavailable',
                nextAttemptAt: new Date(Date.now() + Math.min(300_000, 5_000 * 2 ** Math.min(row.attempts, 6)))
            })
        } finally {
            await repo.update({ id: row.id, leaseToken }, { leaseToken: null, leaseUntil: null })
        }
    }
}
