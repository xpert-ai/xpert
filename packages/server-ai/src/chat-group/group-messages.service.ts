import { GroupComposerService } from './group-composer.service'
import { isEqual } from 'lodash-es'
// Invariants: authors come from authentication/execution bindings, not message text.
// A group row serializes public sequence/idempotency/reply claims only, never a model call.
import { Injectable } from '@nestjs/common'
import { DataSource, In, LessThan } from 'typeorm'
import { randomUUID } from 'node:crypto'
import type {
    ChatGroupCommunication,
    ChatGroupMessage,
    ChatGroupSnapshot,
    ChatGroupSendInput
} from '@xpert-ai/contracts'
import { groupMentionRecipients } from './group-mentions'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { ChatConversationThread } from '../chat-conversation/conversation-thread.entity'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { GroupParticipant, GroupMessageRecipient, GroupInteraction } from './group.entity'
import { GroupAccessService } from './group-access.service'
import { publicMembers } from './group-members.service'
import { parseGroupCommunication, GroupSendInput } from './group.schema'
import { groupConflict, groupDenied } from './group.errors'

/** Public message projection; runtime links expose participant IDs rather than private thread identifiers. */
export function publicMessage(message: ChatMessage, receipts: GroupMessageRecipient[]): ChatGroupMessage {
    return {
        id: message.id,
        clientMessageId: message.messageEnvelope?.correlation?.messageId ?? message.id,
        sequence: message.sequence,
        text: typeof message.content === 'string' ? message.content : '',
        createdAt: message.createdAt.toISOString(),
        communication: parseGroupCommunication(message.groupCommunication),
        runtimeParticipantIds: [
            ...new Set([
                ...(message.groupPublicationId?.match(/^(output|tool):/)
                    ? [parseGroupCommunication(message.groupCommunication).senderId]
                    : []),
                ...receipts
                    .filter((receipt) => receipt.messageId === message.id && receipt.executionId)
                    .map((receipt) => receipt.participantId)
            ])
        ],
        deliveries: receipts
            .filter((receipt) => receipt.messageId === message.id)
            .map((receipt) => ({ participantId: receipt.participantId, status: receipt.status }))
    }
}

@Injectable()
export class GroupMessagesService {
    constructor(
        private readonly db: DataSource,
        private readonly access: GroupAccessService,
        private readonly composer: GroupComposerService
    ) {}

    /** Internal typed-intent entry point; the sender always comes from current group authorization. */
    async send(groupId: string, input: GroupSendInput) {
        const { group, actor } = await this.access.authorize(groupId)
        return this.publish(group, actor, input)
    }

    /** Human input routes by validated mention spans, falling back to the group.xpertId Assistant. */
    async submit(groupId: string, input: ChatGroupSendInput) {
        const { group, actor } = await this.access.authorize(groupId)
        const members = await this.db.getRepository(GroupParticipant).findBy({ groupId, active: true })
        let recipients = groupMentionRecipients(input.text, input.mentions ?? [], members)
        if (!recipients.length) {
            const primary = members.find((member) => member.kind === 'assistant' && member.subjectId === group.xpertId)
            if (!primary) throw groupDenied()
            recipients = [primary.id]
        }
        const base = { text: input.text, clientMessageId: input.clientMessageId, composer: input.composer }
        if (input.replyToMessageId) {
            const original = await this.db
                .getRepository(ChatMessage)
                .findOneBy({ id: input.replyToMessageId, conversationId: groupId })
            if (!original) throw groupConflict()
            const sender = parseGroupCommunication(original.groupCommunication).senderId
            if (recipients.length === 1 && recipients[0] === sender)
                return this.publish(group, actor, { ...base, intent: 'reply', replyToMessageId: original.id })
        }
        return this.publish(group, actor, { ...base, intent: 'request', recipientIds: recipients })
    }

    /**
     * The caller supplies an already verified runtime binding; HTTP never accepts this author argument.
     * Persist public messages and delivery receipts atomically under the group lock. Publication IDs make retries
     * idempotent; reply claims and causal-chain limits prevent duplicate completion and unbounded Assistant loops.
     * This method only records delivery intent; the existing dispatch pipeline handles actual execution.
     */
    async publish(
        group: ChatConversation,
        author: GroupParticipant,
        input: GroupSendInput,
        root?: ChatGroupCommunication,
        publicationId?: string,
        projection = false,
        causedByMessageId?: string
    ) {
        if (!author.active || author.groupId !== group.id) throw groupDenied()
        const recipients = input.intent === 'reply' ? [] : input.recipientIds
        let authorizedRecipients = recipients
        if (input.intent === 'reply') {
            const original = await this.db
                .getRepository(ChatMessage)
                .findOneBy({ id: input.replyToMessageId, conversationId: group.id })
            if (!original) throw groupConflict()
            authorizedRecipients = [parseGroupCommunication(original.groupCommunication).senderId]
        }
        if (author.kind === 'user') {
            for (const id of authorizedRecipients) {
                const target = await this.db
                    .getRepository(GroupParticipant)
                    .findOneBy({ id, groupId: group.id, active: true })
                if (!target) throw groupDenied()
                if (target.kind === 'assistant' && input.intent !== 'message')
                    await this.access.assistant(target.subjectId)
            }
        }
        if (input.composer) {
            if (
                author.kind !== 'user' ||
                input.intent === 'message' ||
                authorizedRecipients.length !== 1 ||
                authorizedRecipients[0] !== input.composer.participantId
            )
                throw groupDenied()
            const target = await this.composer.member(group.id, input.composer.participantId)
            await this.composer.validate(target, input.composer)
        }
        return this.db.transaction(async (manager) => {
            const locked = await manager.findOne(ChatConversation, {
                where: {
                    id: group.id,
                    tenantId: group.tenantId,
                    organizationId: group.organizationId,
                    purpose: 'group'
                },
                lock: { mode: 'pessimistic_write' }
            })
            const sender = await manager.findOneBy(GroupParticipant, { id: author.id, groupId: group.id, active: true })
            if (!locked || !sender) throw groupDenied()
            if (sender.kind === 'assistant' && publicationId?.startsWith('tool:')) {
                const runtime = await manager.findOne(ChatConversationThread, {
                    where: { threadId: sender.runtimeThreadId },
                    lock: { mode: 'pessimistic_write' }
                })
                if (
                    runtime?.status !== 'busy' ||
                    !runtime.runControl ||
                    !publicationId.startsWith(`tool:${runtime.runControl.executionId}:`)
                )
                    throw groupDenied()
            }
            const key = publicationId ?? `${author.id}:${input.clientMessageId}`
            const existing = await manager.findOneBy(ChatMessage, { conversationId: group.id, groupPublicationId: key })
            if (existing) {
                const communication = parseGroupCommunication(existing.groupCommunication)
                if (projection && sender.kind === 'assistant' && communication.senderId === sender.id) {
                    // A paused/canceled visible answer is durable. Resuming updates that same public message.
                    if (communication.intent === input.intent || communication.intent === 'reply') {
                        if (existing.content !== input.text) {
                            existing.content = input.text
                            await manager.save(existing)
                            await manager.increment(ChatConversation, { id: group.id }, 'revision', 1)
                        }
                        return publicMessage(
                            existing,
                            await manager.findBy(GroupMessageRecipient, { messageId: existing.id })
                        )
                    }
                    if (communication.intent !== 'message' || input.intent !== 'reply') throw groupConflict()
                } else {
                    if (
                        existing.content !== input.text ||
                        communication.senderId !== sender.id ||
                        communication.intent !== input.intent ||
                        !isEqual(communication.composer, input.composer) ||
                        (input.intent === 'reply'
                            ? communication.replyToMessageId !== input.replyToMessageId
                            : JSON.stringify(communication.recipientIds) !== JSON.stringify(recipients))
                    )
                        throw groupConflict()
                    return publicMessage(
                        existing,
                        await manager.findBy(GroupMessageRecipient, { messageId: existing.id })
                    )
                }
            }
            const id = existing?.id ?? randomUUID()
            let targets = recipients
            let replyReceipt: GroupMessageRecipient | null = null
            let inherited = root
            if (input.intent === 'reply') {
                const original = await manager.findOneBy(ChatMessage, {
                    id: input.replyToMessageId,
                    conversationId: group.id
                })
                if (!original?.groupCommunication) throw groupConflict()
                const communication = parseGroupCommunication(original.groupCommunication)
                replyReceipt = await manager.findOneBy(GroupMessageRecipient, {
                    messageId: original.id,
                    participantId: sender.id
                })
                if (
                    communication.intent !== 'request' ||
                    !replyReceipt ||
                    replyReceipt.replyMessageId ||
                    ['blocked', 'canceled', 'failed'].includes(replyReceipt.status)
                )
                    throw groupConflict()
                targets = [communication.senderId]
                inherited = communication
            }
            if (targets.includes(sender.id) || (inherited?.hop ?? 0) >= 8) throw groupConflict()
            const members = targets.length
                ? await manager.findBy(GroupParticipant, { groupId: group.id, id: In(targets), active: true })
                : []
            if (members.length !== targets.length) throw groupDenied()
            const rootUserId =
                sender.kind === 'user' && input.intent !== 'reply' ? sender.subjectId : inherited?.rootUserId
            if (!rootUserId) throw groupDenied()
            if (
                !(await manager.findOneBy(GroupParticipant, {
                    groupId: group.id,
                    kind: 'user',
                    subjectId: rootUserId,
                    active: true
                }))
            )
                throw groupDenied()
            const communication: ChatGroupCommunication = {
                ...(input.composer ? { composer: input.composer } : {}),
                intent: input.intent,
                senderId: sender.id,
                recipientIds: targets,
                ...(input.intent === 'reply' ? { replyToMessageId: input.replyToMessageId } : {}),
                ...(causedByMessageId ? { causedByMessageId } : {}),
                rootMessageId: inherited?.rootMessageId ?? id,
                rootUserId,
                hop: inherited ? inherited.hop + 1 : 0
            }
            if (inherited) {
                const chainSize = await manager
                    .getRepository(ChatMessage)
                    .createQueryBuilder('message')
                    .where('message.conversationId = :groupId', { groupId: group.id })
                    .andWhere("message.groupCommunication ->> 'rootMessageId' = :root", {
                        root: inherited.rootMessageId
                    })
                    .getCount()
                if (chainSize >= 32) throw groupConflict()
            }
            if (!existing) locked.lastMessageSequence++
            locked.revision++
            const message = await manager.save(
                ChatMessage,
                manager.create(ChatMessage, {
                    id,
                    ...(existing ? { createdAt: existing.createdAt } : {}),
                    tenantId: group.tenantId,
                    organizationId: group.organizationId,
                    conversationId: group.id,
                    createdInThreadId: group.threadId,
                    createdById: sender.kind === 'user' ? sender.subjectId : sender.principalUserId,
                    role: sender.kind === 'user' ? 'human' : 'ai',
                    content: input.text,
                    sequence: existing?.sequence ?? locked.lastMessageSequence,
                    groupCommunication: communication,
                    groupPublicationId: key,
                    messageEnvelope: {
                        version: 1,
                        source:
                            sender.kind === 'user'
                                ? { type: 'user', userId: sender.subjectId }
                                : { type: 'assistant', xpertId: sender.subjectId },
                        presentation: 'message',
                        correlation: {
                            messageId: input.clientMessageId,
                            ...(input.intent === 'reply' ? { replyToMessageId: input.replyToMessageId } : {})
                        }
                    }
                })
            )
            if (existing) await manager.delete(GroupMessageRecipient, { messageId: id })
            const receipts = await manager.save(
                GroupMessageRecipient,
                members.map((member) =>
                    manager.create(GroupMessageRecipient, {
                        tenantId: group.tenantId,
                        organizationId: group.organizationId,
                        groupId: group.id,
                        messageId: id,
                        participantId: member.id,
                        wake: member.kind === 'assistant' && input.intent !== 'message',
                        status: member.kind === 'assistant' && input.intent !== 'message' ? 'pending' : 'consumed'
                    })
                )
            )
            if (replyReceipt) {
                replyReceipt.replyMessageId = id
                await manager.save(replyReceipt)
            }
            await manager.save(locked)
            return publicMessage(message, receipts)
        })
    }

    /** Reauthorize each read and project bounded public history, members, deliveries and run status. */
    async snapshot(groupId: string, before?: number, limit = 50): Promise<ChatGroupSnapshot> {
        const { group, actor } = await this.access.authorize(groupId)
        const members = await this.db.getRepository(GroupParticipant).find({
            where: { groupId },
            order: { createdAt: 'ASC', id: 'ASC' }
        })
        const rows = await this.db.getRepository(ChatMessage).find({
            where: { conversationId: groupId, ...(before ? { sequence: LessThan(before) } : {}) },
            order: { sequence: 'DESC' },
            take: limit + 1
        })
        const messages = rows.slice(0, limit).reverse()
        const receipts = messages.length
            ? await this.db
                  .getRepository(GroupMessageRecipient)
                  .findBy({ messageId: In(messages.map((message) => message.id)) })
            : []
        const runtimes = members.filter((member) => member.active && member.runtimeThreadId)
        const threads = runtimes.length
            ? await this.db
                  .getRepository(ChatConversationThread)
                  .findBy({ threadId: In(runtimes.map((member) => member.runtimeThreadId)) })
            : []
        return {
            id: group.id,
            threadId: group.threadId,
            title: group.title,
            revision: group.revision,
            viewerParticipantId: actor.id,
            xpertId: group.xpertId,
            interactions: (
                await this.db.getRepository(GroupInteraction).findBy({ groupId, status: In(['pending', 'claimed']) })
            ).map((item) => ({
                id: item.id,
                runId: item.runId,
                participantId: item.participantId,
                assignedUserId: item.assignedUserId,
                status: item.status
            })),
            members: await publicMembers(this.db, group, members),
            messages: messages.map((message) => publicMessage(message, receipts)),
            hasMore: rows.length > limit,
            runs: threads
                .filter((thread) => thread.runControl)
                .map((thread) => ({
                    participantId: runtimes.find((member) => member.runtimeThreadId === thread.threadId).id,
                    runId: thread.runControl.executionId,
                    status: thread.status
                }))
        }
    }

    /** Update only the current member; read progress is monotonic and capped at the last public message. */
    async preferences(groupId: string, input: { readSequence?: number; pinned?: boolean; archived?: boolean }) {
        const { group, actor } = await this.access.authorize(groupId)
        const { readSequence, ...preferences } = input
        const update = this.db
            .getRepository(GroupParticipant)
            .createQueryBuilder()
            .update()
            .set({
                ...preferences,
                ...(readSequence !== undefined ? { readSequence: () => 'GREATEST("readSequence", :readSequence)' } : {})
            })
            .where({ id: actor.id })
        if (readSequence !== undefined)
            update.setParameter('readSequence', Math.min(group.lastMessageSequence, readSequence))
        await update.execute()
        return { updated: true }
    }
}
