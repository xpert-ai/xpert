import { isRuntimeChatMessage, type IChatMessage } from '@xpert-ai/contracts'
import { messageAncestorPath } from '../message-path'
import { messageSegments, type SegmentPath } from './segments'
import { visibleText } from './presentation'
import { groupTrailEpisodes, trailStatus } from './trail-model'
import type { TrailGraph, TrailStep } from './trail.schema'

export type TrailThread = Omit<SegmentPath, 'messages'> & {
    headMessageId?: string | null
    purpose?: 'side-chat' | 'message-edit'
}
export function conversationTrail(
    conversationId: string,
    title: string,
    threadId: string,
    threads: TrailThread[],
    messages: IChatMessage[]
): TrailGraph {
    const paths = threads.map((thread) => ({
        ...thread,
        current: thread.threadId === threadId,
        messages: thread.headMessageId ? messageAncestorPath(messages, thread.headMessageId) : []
    }))
    const plans = messageSegments(conversationId, title, paths)
    const byId = new Map(messages.map((message) => [message.id, message]))
    const questionFor = (message: IChatMessage) => {
        const seen = new Set<string>()
        let cursor: IChatMessage | undefined = message
        while (cursor && !seen.has(cursor.id)) {
            if (cursor.role === 'human') return cursor
            seen.add(cursor.id)
            cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
        }
        return undefined
    }
    const graph: TrailGraph = {
        version: 1,
        layer: 'conversation',
        conversationId,
        threadId,
        title,
        lanes: [],
        steps: [],
        episodes: [],
        coverage: [],
        live: threads.some((thread) => trailStatus(thread.status) === 'running')
    }
    for (const plan of plans.slice(0, 500)) {
        const n = plan.node
        const parentId = n.parentId === `conversation:${conversationId}` ? null : n.parentId
        graph.lanes.push({
            id: n.id,
            parentId,
            title: n.title,
            primary: !!n.current,
            status: trailStatus(n.status),
            threadId: n.threadId,
            purpose: threads.find((thread) => thread.threadId === n.threadId)?.purpose,
            spawnStepId: graph.steps.filter((step) => step.laneId === parentId).at(-1)?.id
        })
        let current: TrailStep | undefined
        for (const id of plan.messageIds ?? []) {
            const message = byId.get(id)
            if (!message || isRuntimeChatMessage(message)) continue
            if (message.content === undefined) {
                graph.coverage.push('record_limit')
                continue
            }
            if (message.role !== 'human' && message.role !== 'ai') continue
            if (graph.steps.length >= 5000) {
                graph.coverage.push('record_limit')
                break
            }
            if (message.role === 'human' || !current) {
                const question = questionFor(message)
                const text = visibleText(question?.content).trim()
                current = {
                    id: `turn:${id}`,
                    laneId: n.id,
                    kind: 'turn',
                    activity: 'task',
                    title: text.slice(0, 100),
                    preview: text.slice(0, 2000),
                    status: 'unknown',
                    order: graph.steps.length,
                    threadId: n.threadId,
                    messageId: id,
                    startedAt: message.createdAt?.toISOString()
                }
                graph.steps.push(current)
            }
            if (message.role === 'ai') {
                current.answer = [current.answer, visibleText(message.content)]
                    .filter(Boolean)
                    .join('\n')
                    .slice(0, 4000)
                current.messageId = message.id
                current.executionId = message.executionId
                current.status = trailStatus(message.status)
            }
        }
    }
    if (plans.length > 500) graph.coverage.push('record_limit')
    return groupTrailEpisodes(graph)
}
