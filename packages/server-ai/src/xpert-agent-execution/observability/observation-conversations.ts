import type { ExecutionObservationConversation } from '@xpert-ai/contracts'
import { observationInterval, observationOverlap, type ObservationFact } from './observation-metrics'

export type ConversationFact = ObservationFact & {
    threadId: string | null
    parentId: string | null
    parentThreadId: string | null
    forkedFromMessageId: string | null
}
export function summarizeConversations(
    facts: ConversationFact[],
    from: number,
    to: number,
    asOf: number
): ExecutionObservationConversation[] {
    const groups = new Map<string, ConversationFact[]>()
    for (const fact of facts) {
        const key = fact.conversationId
            ? `conversation:${fact.conversationId}`
            : fact.threadId
              ? `thread:${fact.threadId}`
              : `execution:${fact.id}`
        const own = groups.get(key)
        if (own) own.push(fact)
        else groups.set(key, [fact])
    }
    return [...groups]
        .sort(
            ([keyA, a], [keyB, b]) =>
                Math.max(...b.map((f) => Date.parse(f.createdAt))) -
                    Math.max(...a.map((f) => Date.parse(f.createdAt))) || keyA.localeCompare(keyB)
        )
        .map(([key, own]) => ({
            key,
            conversationId: own[0].conversationId,
            threadId: own[0].conversationId ? null : own[0].threadId,
            executionId: !own[0].conversationId && !own[0].threadId ? own[0].id : null,
            total: own.length,
            threads: new Set(own.map((f) => f.threadId).filter(Boolean)).size,
            branches: new Set(
                own
                    .filter((f) => f.parentThreadId || f.forkedFromMessageId)
                    .map((f) => f.threadId)
                    .filter(Boolean)
            ).size,
            childExecutions: own.filter((f) => f.parentId).length,
            failed: own.filter((f) => f.status === 'error' || f.status === 'timeout').length,
            unknownEnds: own.filter((f) => !observationInterval(f, from, to, asOf)).length,
            overlap: observationOverlap(own, from, to, asOf),
            failures: own
                .filter(
                    (f) =>
                        (f.status === 'error' || f.status === 'timeout') &&
                        f.completedAt &&
                        Date.parse(f.completedAt) >= from &&
                        Date.parse(f.completedAt) < to &&
                        Date.parse(f.completedAt) <= asOf
                )
                .sort((a, b) => Date.parse(b.completedAt!) - Date.parse(a.completedAt!))
                .slice(0, 50)
                .map((f) => ({ id: f.id, completedAt: f.completedAt! }))
        }))
}
