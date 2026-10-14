import { In, IsNull, type Repository } from 'typeorm'
import { ChatMessage } from '../../chat-message/chat-message.entity'
import { messageAncestorPath } from '../message-path'
import { humanMessageSummary } from './presentation'
import { messageSegments, replySummary, type SegmentPath } from './segments'
import type { MapNode } from './schema'

export type SegmentThread = Omit<SegmentPath, 'messages'> & { headMessageId?: string | null }

/** Two batched message reads: metadata for topology, then only the questions/replies used by node summaries. */
export async function readSegments(
    repository: Pick<Repository<ChatMessage>, 'find'>,
    scope: { conversationId: string; tenantId: string; organizationId?: string | null },
    title: string,
    threads: SegmentThread[],
    boundaries: ReadonlySet<string> = new Set()
): Promise<MapNode[]> {
    const where = { ...scope, organizationId: scope.organizationId ?? IsNull() }
    const links = await repository.find({
        where,
        select: {
            id: true,
            parentId: true,
            role: true,
            messageEnvelope: true,
            createdInThreadId: true,
            createdAt: true,
            updatedAt: true
        }
    })
    const plans = messageSegments(
        scope.conversationId,
        title,
        threads.map(({ headMessageId, ...thread }) => ({
            ...thread,
            messages: headMessageId ? messageAncestorPath(links, headMessageId) : []
        })),
        boundaries
    )
    const ids = [
        ...new Set(
            plans.flatMap(({ questionId, replyId }) => [questionId, replyId].filter((id): id is string => Boolean(id)))
        )
    ]
    const summaries = ids.length
        ? await repository.find({
              where: { ...where, id: In(ids) },
              select: { id: true, role: true, content: true, createdInThreadId: true, createdAt: true, updatedAt: true }
          })
        : []
    const byId = new Map(summaries.map((message) => [message.id, message]))
    return plans.map(({ node, questionId, replyId }) => ({
        ...node,
        lastHumanMessage: humanMessageSummary(byId.get(questionId), node.threadId!),
        answer: replyId ? replySummary(byId.get(replyId)?.content) : ''
    }))
}
