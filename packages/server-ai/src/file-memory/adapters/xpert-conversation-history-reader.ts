import { ChatMessageStepCategory } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, IsNull, Repository } from 'typeorm'
import { ChatConversation, ChatMessage } from '../../core/entities/internal'
import { projectThreadTurns } from '../../chat-conversation/thread-read-projection'
import { visibleChatMessageSql } from '../../chat-message/message-envelope'
import { FileMemoryConversationHistoryReader, FileMemorySessionSnippet } from '../../plugins/file-memory/ports'

@Injectable()
export class XpertConversationHistoryReader implements FileMemoryConversationHistoryReader {
    constructor(
        @InjectRepository(ChatConversation) private readonly conversations: Repository<ChatConversation>,
        @InjectRepository(ChatMessage) private readonly messages: Repository<ChatMessage>
    ) {}

    async readSnippets(input: Parameters<FileMemoryConversationHistoryReader['readSnippets']>[0]) {
        const { xpert, conversationIds, maxMessages, maxBytes } = input
        // The evidence artifact has the audience of the destination volume.
        if (!conversationIds.length || (!xpert.projectId && (xpert.workspaceDataScope !== 'user' || !xpert.userId)))
            return []
        const allowed = await this.conversations.find({
            where: {
                id: In(conversationIds),
                xpertId: xpert.id,
                tenantId: xpert.tenantId,
                organizationId: xpert.organizationId ?? IsNull(),
                purpose: 'private',
                ...(xpert.projectId
                    ? { projectId: xpert.projectId }
                    : { projectId: IsNull(), createdById: xpert.userId! })
            },
            select: ['id']
        })
        if (!allowed.length) return []
        const allowedIds = new Set(allowed.map((c) => c.id))
        const anchors = (input.anchors ?? []).filter((a) => allowedIds.has(a.conversationId))
        const eligible = () =>
            this.messages
                .createQueryBuilder('m')
                .select([
                    'm.id',
                    'm.conversationId',
                    'm.createdAt',
                    'm.role',
                    'm.status',
                    'm.content',
                    'm.executionId',
                    'm.messageEnvelope',
                    'm.events',
                    'm.parentId'
                ])
                .where('m.conversationId IN (:...ids)', { ids: [...allowedIds] })
                .andWhere('m.tenantId = :tenant', { tenant: xpert.tenantId })
                .andWhere("(m.followUpStatus IS NULL OR m.followUpStatus = 'consumed')")
                .andWhere(visibleChatMessageSql('m.messageEnvelope'))
                .andWhere("m.role IN ('human','ai')")
                .orderBy('m.createdAt', 'DESC')
                .addOrderBy('m.id', 'DESC')
        const anchored: ChatMessage[] = []
        if (anchors.length) {
            const exactRows = await eligible()
                .andWhere('m.id IN (:...idsOfMessages)', { idsOfMessages: anchors.map((a) => a.messageId) })
                .take(maxMessages)
                .getMany()
            for (const a of anchors) {
                const exact = exactRows.find((row) => row.id === a.messageId && row.conversationId === a.conversationId)
                if (exact) anchored.push(exact)
            }
            if (anchored.length && anchored.length < maxMessages) {
                const children = await eligible()
                    .andWhere('m.parentId IN (:...parents)', { parents: anchored.map((row) => row.id) })
                    .take(maxMessages - anchored.length)
                    .getMany()
                const parents = new Map(anchored.map((row) => [row.id, row.conversationId]))
                anchored.push(...children.filter((row) => parents.get(row.parentId) === row.conversationId))
            }
        }
        // Only legacy conversation-level citations need a recency window.
        const legacyIds = [...allowedIds].filter((id) => !anchors.some((a) => a.conversationId === id))
        const recent =
            legacyIds.length && anchored.length < maxMessages
                ? await eligible()
                      .andWhere('m.conversationId IN (:...legacyIds)', { legacyIds })
                      .take(maxMessages - anchored.length)
                      .getMany()
                : []
        const result: FileMemorySessionSnippet[] = []
        const seen = new Set<string>()
        let bytes = 0
        for (const row of [...anchored, ...recent]) {
            if (seen.has(row.id) || result.length >= maxMessages) continue
            seen.add(row.id)
            row.events = row.events?.filter(
                (event) =>
                    event.category === 'Tool' &&
                    event.status === 'success' &&
                    event.type !== ChatMessageStepCategory.Memory &&
                    !['memory_get', 'memory_search', 'memory_write'].includes(event.tool ?? '')
            )
            const message = projectThreadTurns([row], {
                threadId: '',
                turnLimit: 1,
                includeOutputs: true,
                maxOutputCharsPerItem: 2000
            })[0]?.messages[0]
            if (!message) continue
            const snippet: FileMemorySessionSnippet = {
                conversationId: row.conversationId,
                messageId: row.id,
                executionId: row.executionId,
                parentMessageId: row.parentId,
                sourceRef: `conversation:${row.conversationId}#message:${row.id}`,
                createdAt: row.createdAt,
                role: row.role,
                sourceType: message.messageEnvelope?.source.type ?? (row.messageEnvelope ? 'unknown' : row.role),
                content: message.text,
                truncated: message.truncated,
                outputs: message.outputs?.slice(0, 3)
            }
            const size = Buffer.byteLength(JSON.stringify(snippet)) + 1
            if (bytes + size > maxBytes) continue
            result.push(snippet)
            bytes += size
        }
        return result
    }
}
