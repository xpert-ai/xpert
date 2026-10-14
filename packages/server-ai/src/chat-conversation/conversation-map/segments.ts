import { isRuntimeChatMessage, type IChatMessage } from '@xpert-ai/contracts'
import { latestUpdate, visibleText } from './presentation'
import type { MapNode } from './schema'

/** No message body, reasoning, events or checkpoints are needed to build the tree. */
export type MessageLink = Pick<
    IChatMessage,
    'id' | 'parentId' | 'role' | 'messageEnvelope' | 'createdInThreadId' | 'createdAt' | 'updatedAt'
>
export type SegmentPath = {
    threadId: string
    title: string
    current: boolean
    status: string
    messages: MessageLink[]
}
/** Internal query plan. These summary pointers are stripped before returning the View DTO. */
export type SegmentPlan = { node: MapNode; questionId?: string; replyId?: string }
type Entry = { message: MessageLink; parent: string | null; threads: Set<string>; questionId?: string }

/** Compress authorized root-to-head paths. An explicit boundary is a fork into an independent conversation. */
export function messageSegments(
    conversationId: string,
    conversationTitle: string,
    paths: SegmentPath[],
    boundaries: ReadonlySet<string> = new Set()
): SegmentPlan[] {
    const entries = new Map<string, Entry>()
    const endings = new Map<string | null, SegmentPath[]>()
    for (const path of paths) {
        let parent: string | null = null
        let questionId: string | undefined
        const visited = new Set<string>()
        for (const message of path.messages) {
            if (isRuntimeChatMessage(message) || (message.role !== 'human' && message.role !== 'ai')) continue
            if (!message.id || visited.has(message.id)) throw new Error('Invalid conversation message path')
            visited.add(message.id)
            if (message.role === 'human') questionId = message.id
            const entry = entries.get(message.id)
            if (entry) {
                if (entry.parent !== parent) throw new Error('Inconsistent conversation message ancestry')
                entry.threads.add(path.threadId)
            } else entries.set(message.id, { message, parent, threads: new Set([path.threadId]), questionId })
            parent = message.id
        }
        if (!endings.has(parent)) endings.set(parent, [])
        endings.get(parent)!.push(path)
    }
    const children = new Map<string | null, string[]>()
    for (const [id, entry] of entries) {
        if (!children.has(entry.parent)) children.set(entry.parent, [])
        children.get(entry.parent)!.push(id)
    }
    const byId = new Map(paths.map((path) => [path.threadId, path]))
    const threadsFor = (ids: Iterable<string>) =>
        [...ids].map((id) => {
            const { messages: _messages, ...thread } = byId.get(id)!
            return thread
        })
    const plans: SegmentPlan[] = []
    const root = `conversation:${conversationId}`
    const empty = (path: SegmentPath, parentId: string) =>
        plans.push({
            node: {
                id: `segment:${conversationId}:empty:${path.threadId}`,
                kind: 'segment',
                parentId,
                conversationId,
                conversationTitle,
                title: path.title,
                threadId: path.threadId,
                current: path.current,
                status: path.status,
                segmentThreads: threadsFor([path.threadId]),
                messageCount: 0,
                preview: '',
                expandable: false
            }
        })
    for (const path of endings.get(null) ?? []) empty(path, root)
    const pending = (children.get(null) ?? []).map((id) => ({ id, parentId: root })).reverse()
    while (pending.length) {
        const { id, parentId } = pending.pop()!
        const segmentThreads = threadsFor(entries.get(id)!.threads)
        const owner = segmentThreads.find((thread) => thread.current) ?? segmentThreads[0]
        let cursor = id,
            count = 0
        let updatedAt: string | undefined
        let replyId: string | undefined
        for (;;) {
            const { message } = entries.get(cursor)!
            count++
            updatedAt = latestUpdate(updatedAt ? new Date(updatedAt) : undefined, message.updatedAt, message.createdAt)
            replyId = message.role === 'ai' ? message.id : undefined
            const next = children.get(cursor) ?? []
            if (next.length !== 1 || endings.has(cursor) || boundaries.has(cursor)) break
            cursor = next[0]
        }
        const next = children.get(cursor) ?? [],
            ends = endings.get(cursor) ?? []
        const placeholders = next.length || ends.length > 1 ? ends : []
        const questionId = entries.get(cursor)!.questionId
        const node: MapNode = {
            id: `segment:${conversationId}:${id}`,
            kind: 'segment',
            parentId,
            conversationId,
            conversationTitle,
            title: owner.title,
            threadId: owner.threadId,
            messageId: questionId ?? cursor,
            endMessageId: cursor,
            messageCount: count,
            current: segmentThreads.some((thread) => thread.current),
            status: owner.status,
            segmentThreads,
            updatedAt,
            preview: '',
            expandable: Boolean(next.length || placeholders.length)
        }
        plans.push({ node, questionId, replyId })
        for (const path of placeholders) empty(path, node.id)
        for (const child of [...next].reverse()) pending.push({ id: child, parentId: node.id })
    }
    return plans
}

/** Two sentences at most, with a hard bound for replies without sentence punctuation. */
export function replySummary(content: unknown): string {
    const text = visibleText(content).trim()
    const sentences = text.match(/[^。！？.!?\n]+[。！？.!?]?/g) ?? []
    const reply = sentences
        .slice(0, 2)
        .map((sentence) => sentence.trim())
        .join(' ')
    return reply.length > 240 ? `${reply.slice(0, 240)}…` : reply
}
