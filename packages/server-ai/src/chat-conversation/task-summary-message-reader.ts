import type { IChatConversation, TChatTaskSummaryContribution } from '@xpert-ai/contracts'
import { In } from 'typeorm'
import type { ChatMessageService } from '../chat-message/chat-message.service'
import { extractChatMessageTaskSummary } from '../chat-message/task-summary'

const BATCH_SIZE = 100
const CACHE_TTL_MS = 60_000
const MAX_ENTRIES = 1000

/** Cache projections, never transcripts. Every read still checks current message versions and caller scope. */
export class TaskSummaryMessageReader {
    private readonly cache = new Map<
        string,
        { revision: number; expires: number; summary: TChatTaskSummaryContribution }
    >()

    async read(
        service: ChatMessageService,
        conversation: Pick<IChatConversation, 'id' | 'tenantId' | 'organizationId'>,
        actorId?: string
    ) {
        const result = await service.findAllInOrganizationOrTenant({
            where: { conversationId: conversation.id },
            select: ['id', 'taskSummary', 'executionId', 'followUpMode', 'followUpStatus', 'createdAt', 'updatedAt'],
            order: { updatedAt: 'DESC' }
        })
        const key = (id: string) =>
            JSON.stringify([conversation.tenantId, conversation.organizationId, actorId, conversation.id, id])
        const missing = result.items.filter((message) => {
            const cached = actorId ? this.cache.get(key(message.id)) : null
            if (
                message.taskSummary &&
                cached &&
                cached.expires > Date.now() &&
                cached.revision === message.updatedAt?.getTime()
            ) {
                message.taskSummary = cached.summary
                return false
            }
            return true
        })
        const summaries = new Map<string, TChatTaskSummaryContribution>()
        for (let offset = 0; offset < missing.length; offset += BATCH_SIZE) {
            const ids = missing.slice(offset, offset + BATCH_SIZE).map((message) => message.id)
            const details = await service.findAllInOrganizationOrTenant({
                where: { conversationId: conversation.id, id: In(ids) },
                select: [
                    'id',
                    'conversationId',
                    'content',
                    'taskSummary',
                    'references',
                    'thirdPartyMessage',
                    'createdAt',
                    'updatedAt'
                ],
                relations: ['attachments', 'fileAssets'],
                take: BATCH_SIZE
            })
            for (const message of details.items) {
                const authorized = await service.filterAuthorizedFileRelations(message, conversation.id)
                const summary = extractChatMessageTaskSummary(authorized)
                summaries.set(message.id, summary)
                // Legacy/file-bearing projections must recheck file relations on every read.
                if (
                    actorId &&
                    message.taskSummary &&
                    !message.attachments?.length &&
                    !message.fileAssets?.length &&
                    message.updatedAt
                ) {
                    if (this.cache.size >= MAX_ENTRIES) this.cache.delete(this.cache.keys().next().value)
                    this.cache.set(key(message.id), {
                        revision: message.updatedAt.getTime(),
                        expires: Date.now() + CACHE_TTL_MS,
                        summary
                    })
                }
            }
        }
        return result.items.map((message) => ({
            ...message,
            taskSummary: summaries.get(message.id) ?? message.taskSummary
        }))
    }
}
