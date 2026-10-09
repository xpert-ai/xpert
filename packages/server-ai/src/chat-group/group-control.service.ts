import { Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { DataSource, In } from 'typeorm'
import { CancelConversationCommand } from '@xpert-ai/plugin-sdk'
import { GroupAccessService } from './group-access.service'
import { GroupParticipant, GroupMessageRecipient, GroupInteraction } from './group.entity'
import { withGroupRuntime } from './group-runtime-context'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { ChatConversationThread } from '../chat-conversation/conversation-thread.entity'
import { ThreadRunControlService } from '../chat-conversation/thread-run-control.service'
import { GroupOutboxService } from './group-outbox.service'
import { groupConflict, groupDenied } from './group.errors'
import type { GroupControlInput } from './group.schema'

/**
 * Invariants: group controls target an authorized member's private runtime and an explicit run ID.
 * Pause/cancel use existing runtime controls; resume reactivates a receipt through Handoff.
 * Receipt cancellation shares runtime admission's lock order and cannot retract a started input.
 */
@Injectable()
export class GroupControlService {
    constructor(
        private readonly db: DataSource,
        private readonly access: GroupAccessService,
        private readonly control: ThreadRunControlService,
        private readonly commands: CommandBus,
        private readonly outbox: GroupOutboxService
    ) {}

    /** Apply a validated run control after checking group membership and Assistant access. */
    async act(groupId: string, participantId: string, input: GroupControlInput) {
        const { actor } = await this.access.authorize(groupId)
        const member = await this.db
            .getRepository(GroupParticipant)
            .findOneBy({ id: participantId, groupId, active: true, kind: 'assistant' })
        if (!member) throw groupDenied()
        await this.access.assistant(member.subjectId)
        const thread = await this.db
            .getRepository(ChatConversationThread)
            .findOneBy({ threadId: member.runtimeThreadId })
        if (!thread) throw groupConflict()
        const interrupted =
            thread.status === 'interrupted' &&
            (await this.db
                .getRepository(GroupInteraction)
                .findOneBy({ groupId, participantId, runId: input.runId, status: In(['pending', 'claimed']) }))
        if (thread.runControl?.executionId !== input.runId && !(input.action === 'cancel' && interrupted))
            throw groupConflict()
        if (input.action === 'pause') await this.control.requestPause(member.runtimeThreadId, input.runId)
        else if (input.action === 'cancel') {
            await withGroupRuntime(member.runtimeConversationId, () =>
                this.commands.execute(
                    new CancelConversationCommand({ threadId: member.runtimeThreadId, executionId: input.runId })
                )
            )
            // Cancel queued follow-ups as well, so stopping this member cannot immediately restart it.
            await this.db
                .getRepository(GroupMessageRecipient)
                .update(
                    { groupId, participantId, status: In(['pending', 'starting', 'steering', 'blocked']) },
                    { status: 'canceled', control: null }
                )
            await this.db
                .getRepository(GroupInteraction)
                .update(
                    { groupId, participantId, runId: input.runId, status: In(['pending', 'claimed']) },
                    { status: 'canceled' }
                )
        } else {
            await this.db.transaction(async (manager) => {
                await manager.findOne(ChatConversation, { where: { id: groupId }, lock: { mode: 'pessimistic_write' } })
                const locked = await manager.findOne(ChatConversationThread, {
                    where: { id: thread.id },
                    lock: { mode: 'pessimistic_write' }
                })
                if (
                    !locked ||
                    locked.status !== 'paused' ||
                    locked.runControl?.executionId !== input.runId ||
                    !locked.runControl.pauseId
                )
                    throw groupConflict()
                const receipt = await manager.findOne(GroupMessageRecipient, {
                    where: { groupId, participantId, executionId: input.runId, status: 'blocked' },
                    order: { createdAt: 'ASC' },
                    lock: { mode: 'pessimistic_write' }
                })
                if (!receipt || receipt.control) throw groupConflict()
                receipt.control = {
                    actorId: actor.subjectId,
                    pauseId: locked.runControl.pauseId,
                    decision: { type: 'confirm' }
                }
                receipt.status = 'pending'
                receipt.phase = null
                receipt.nextAttemptAt = new Date()
                await manager.save(receipt)
            })
            // Dispatch only after the human decision is durable; runtime preparation rechecks the pause ID.
            await this.outbox.flush(groupId)
        }
        await this.db.getRepository(ChatConversation).increment({ id: groupId }, 'revision', 1)
        return { accepted: true }
    }

    /** Let the sender or group owner retract only this pending/blocked recipient delivery. */
    async cancelDelivery(groupId: string, messageId: string, participantId: string) {
        const { actor } = await this.access.authorize(groupId)
        await this.db.transaction(async (manager) => {
            await manager.findOne(ChatConversation, { where: { id: groupId }, lock: { mode: 'pessimistic_write' } })
            const member = await manager.findOneBy(GroupParticipant, { id: participantId, groupId })
            if (!member) throw groupDenied()
            // Same lock order as runtime admission closes cancel-versus-start races.
            if (member.runtimeThreadId)
                await manager.findOne(ChatConversationThread, {
                    where: { threadId: member.runtimeThreadId },
                    lock: { mode: 'pessimistic_write' }
                })
            const message = await manager.findOneBy(ChatMessage, { id: messageId, conversationId: groupId })
            if (!message || (message.groupCommunication?.senderId !== actor.id && actor.role !== 'owner'))
                throw groupDenied()
            const receipt = await manager.findOne(GroupMessageRecipient, {
                where: { groupId, messageId, participantId },
                lock: { mode: 'pessimistic_write' }
            })
            if (!receipt || !['pending', 'blocked'].includes(receipt.status)) throw groupConflict()
            receipt.status = 'canceled'
            receipt.control = null
            await manager.save(receipt)
            await manager.increment(ChatConversation, { id: groupId }, 'revision', 1)
        })
        return { canceled: true }
    }
}
