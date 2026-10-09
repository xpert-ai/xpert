import { CommandBus } from '@nestjs/cqrs'
import { FinishGroupChatCommand } from './group-dispatch.commands'
import { AGENT_CHAT_CALLBACK_NOOP_MESSAGE_TYPE } from '../handoff/plugins/agent-chat/agent-chat-callback-noop.processor'
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { DataSource, In, LessThanOrEqual } from 'typeorm'
import { randomUUID } from 'node:crypto'
import {
    AGENT_CHAT_DISPATCH_MESSAGE_TYPE,
    defineAgentMessageType,
    HandoffMessage,
    HandoffProcessorStrategy,
    IHandoffProcessor,
    ProcessResult,
    AgentChatDispatchPayload
} from '@xpert-ai/plugin-sdk'
import { HandoffOutboxAdapter, HandoffOutboxAdapters } from '../handoff/outbox-adapters.service'
import { HandoffQueueService } from '../handoff/message-queue.service'
import { ChatConversationThread } from '../chat-conversation/conversation-thread.entity'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { GroupMessageRecipient, GroupParticipant } from './group.entity'
import { groupJobSchema } from './group.schema'

export const GROUP_MESSAGE_TYPE = defineAgentMessageType('group_message', 1)

/**
 * Invariants: recipient rows are durable delivery receipts, not a second queue.
 * The existing Handoff scanner/transport retries them; enqueue success is not consumption.
 * Runtime preparation rechecks authorization and owns idempotent admission after dequeue.
 */
@Injectable()
export class GroupOutboxService implements OnModuleInit, OnModuleDestroy, HandoffOutboxAdapter {
    private unregister?: () => void
    constructor(
        private readonly db: DataSource,
        private readonly queue: HandoffQueueService,
        private readonly adapters: HandoffOutboxAdapters,
        private readonly commands: CommandBus
    ) {}
    onModuleInit() {
        this.unregister = this.adapters.register(this)
    }
    onModuleDestroy() {
        this.unregister?.()
    }

    /** Recover in-flight receipts and retry due deliveries through the shared transport scan. */
    async reconcile() {
        const active = await this.db.getRepository(GroupMessageRecipient).find({
            where: [
                { status: In(['starting', 'steering']), nextAttemptAt: LessThanOrEqual(new Date()) },
                { status: 'canceled', phase: 'started', nextAttemptAt: LessThanOrEqual(new Date()) }
            ],
            order: { nextAttemptAt: 'ASC' },
            take: 100
        })
        // Rotate long-running receipts so one busy page of work cannot starve later groups.
        await Promise.allSettled(
            active.map(async (row) => {
                await this.db
                    .getRepository(GroupMessageRecipient)
                    .update({ id: row.id, status: row.status }, { nextAttemptAt: new Date(Date.now() + 5000) })
                await this.commands.execute(new FinishGroupChatCommand(row.id))
            })
        )
        const rows = await this.db.getRepository(GroupMessageRecipient).find({
            where: { wake: true, status: 'pending', nextAttemptAt: LessThanOrEqual(new Date()) },
            order: { nextAttemptAt: 'ASC' },
            take: 20
        })
        await Promise.allSettled(rows.map((row) => this.deliver(row)))
    }

    /** Prompt delivery after a committed group change; recovery remains safe if transport fails. */
    async flush(groupId: string) {
        const rows = await this.db
            .getRepository(GroupMessageRecipient)
            .findBy({ groupId, wake: true, status: 'pending', nextAttemptAt: LessThanOrEqual(new Date()) })
        await Promise.allSettled(rows.map((row) => this.deliver(row)))
    }

    /** A short database lease prevents concurrent scanners from enqueueing the same receipt at once. */
    private async deliver(row: GroupMessageRecipient) {
        const repo = this.db.getRepository(GroupMessageRecipient)
        const leaseToken = randomUUID()
        const claim = await repo
            .createQueryBuilder()
            .update()
            .set({ leaseToken, leaseUntil: new Date(Date.now() + 60_000), attempts: () => 'attempts + 1' })
            .where({ id: row.id, status: 'pending' })
            .andWhere('("leaseUntil" IS NULL OR "leaseUntil" < now())')
            .execute()
        if (!claim.affected) return
        try {
            await this.queue.enqueue(this.message(row))
            await repo.update({ id: row.id, leaseToken }, { nextAttemptAt: new Date(Date.now() + 30_000) })
        } catch {
            // Transport failures retain the committed receipt and use the existing scanner for bounded retries.
            const exhausted = row.attempts >= 9
            await repo.update(
                { id: row.id, leaseToken, status: 'pending' },
                {
                    status: exhausted ? 'failed' : 'pending',
                    error: 'transport_unavailable',
                    nextAttemptAt: new Date(Date.now() + Math.min(300_000, 5000 * 2 ** Math.min(row.attempts, 6)))
                }
            )
            if (exhausted) await this.db.getRepository(ChatConversation).increment({ id: row.groupId }, 'revision', 1)
        } finally {
            await repo.update({ id: row.id, leaseToken }, { leaseToken: null, leaseUntil: null })
        }
    }

    /** Stable job identity preserves transport deduplication across retries; no credentials enter the job. */
    message(row: GroupMessageRecipient): HandoffMessage<{ recipientId: string }> {
        return {
            id: `group:${row.id}`,
            type: GROUP_MESSAGE_TYPE,
            version: 1,
            tenantId: row.tenantId,
            sessionKey: row.participantId,
            businessKey: row.groupId,
            attempt: 1,
            maxAttempts: 5,
            traceId: row.messageId,
            enqueuedAt: Date.now(),
            payload: { recipientId: row.id },
            headers: { organizationId: row.organizationId, handoffQueue: 'realtime' }
        }
    }

    /** Resolve a tenant-bound receipt into the existing chat dispatch; no model runs in this adapter. */
    async route(id: string, tenantId: string): Promise<ProcessResult> {
        const row = await this.db
            .getRepository(GroupMessageRecipient)
            .findOneBy({ id, tenantId, status: 'pending', wake: true })
        if (!row) return { status: 'ok' }
        const member = await this.db
            .getRepository(GroupParticipant)
            .findOneBy({ id: row.participantId, groupId: row.groupId, active: true })
        if (!member) {
            await this.db
                .getRepository(GroupMessageRecipient)
                .update({ id }, { status: 'blocked', error: 'member_removed' })
            return { status: 'ok' }
        }
        const thread = await this.db
            .getRepository(ChatConversationThread)
            .findOneBy({ threadId: member.runtimeThreadId })
        // The common processor rechecks state after dequeue, under the runtime writer lock.
        const payload: AgentChatDispatchPayload = {
            request: {
                action: 'send',
                conversationId: member.runtimeConversationId,
                message: { input: { input: '' } }
            },
            options: { xpertId: member.subjectId, groupDeliveryId: row.id },
            callback: { messageType: AGENT_CHAT_CALLBACK_NOOP_MESSAGE_TYPE, events: 'lifecycle' }
        }
        await this.queue.enqueue({
            ...this.message(row),
            id: `group:dispatch:${row.id}`,
            type: AGENT_CHAT_DISPATCH_MESSAGE_TYPE,
            payload,
            headers: {
                organizationId: row.organizationId,
                handoffQueue: thread?.status === 'busy' ? 'realtime' : 'handoff',
                policyTimeoutMs: '3600000'
            }
        })
        return { status: 'ok' }
    }
}

@Injectable()
@HandoffProcessorStrategy(GROUP_MESSAGE_TYPE, { types: [GROUP_MESSAGE_TYPE], policy: { lane: 'main' } })
export class GroupMessageProcessor implements IHandoffProcessor<{ recipientId: string }> {
    constructor(private readonly outbox: GroupOutboxService) {}
    process(message: HandoffMessage<{ recipientId: string }>) {
        const input = groupJobSchema.parse(message.payload)
        return this.outbox.route(input.recipientId, message.tenantId)
    }
}
