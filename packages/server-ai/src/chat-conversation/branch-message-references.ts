import type { TChatTaskSummaryContribution } from '@xpert-ai/contracts'

/** Rebind platform navigation IDs; resource IDs and tool-call IDs stay shared. */
export function rebindTaskSummary(
    summary: TChatTaskSummaryContribution | undefined,
    messageIds: ReadonlyMap<string, string>
) {
    if (!summary) return summary
    const rebind = <T extends { messageId?: string }>(value: T): T =>
        value ? { ...value, ...(value.messageId ? { messageId: messageIds.get(value.messageId) } : {}) } : value
    return {
        ...summary,
        plan: rebind(summary.plan),
        todos: rebind(summary.todos),
        fileChanges: summary.fileChanges?.map(rebind),
        outputs: summary.outputs?.map(rebind),
        sources: summary.sources?.map(rebind)
    }
}
