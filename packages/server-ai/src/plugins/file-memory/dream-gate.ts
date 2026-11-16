import type {
    FileMemoryDreamGateConfig,
    FileMemoryDreamGateResult,
    FileMemoryDreamRunSummary,
    FileMemorySignal
} from './types'

export function createPassingGateResult(
    config: FileMemoryDreamGateConfig,
    reasons: string[],
    previousRun?: FileMemoryDreamRunSummary
): FileMemoryDreamGateResult {
    return {
        passed: true,
        lastRunId: previousRun?.runId,
        lastFinishedAt: previousRun?.finishedAt,
        checkedSince: previousRun?.finishedAt ?? previousRun?.startedAt ?? previousRun?.requestedAt,
        newOrUpdatedMemoryCount: 0,
        conversationCount: 0,
        elapsedMinutes: previousRun?.finishedAt
            ? Math.max(0, Math.floor((Date.now() - Date.parse(previousRun.finishedAt)) / 60_000))
            : undefined,
        config,
        reasons
    }
}

export function isRecordChangedSince(
    record: {
        document: { frontmatter: { createdAt?: string; updatedAt?: string; updatedBy?: string } }
        mtimeMs: number
    },
    since: string
) {
    const sinceMs = Date.parse(since)
    if (!Number.isFinite(sinceMs)) {
        return false
    }
    const createdAt = Date.parse(record.document.frontmatter.createdAt ?? '')
    const updatedAt = Date.parse(record.document.frontmatter.updatedAt ?? '')
    const updatedBy = record.document.frontmatter.updatedBy
    return (
        (Number.isFinite(createdAt) && createdAt > sinceMs) ||
        (updatedBy !== 'file_memory_signal' && Number.isFinite(updatedAt) && updatedAt > sinceMs) ||
        (!updatedBy && record.mtimeMs > sinceMs)
    )
}

export function countSignalConversationsSince(signals: FileMemorySignal[], since: string) {
    const sinceMs = Date.parse(since)
    if (!Number.isFinite(sinceMs)) {
        return 0
    }
    const conversations = new Set<string>()
    for (const signal of signals) {
        const createdAt = Date.parse(signal.createdAt)
        if (!Number.isFinite(createdAt) || createdAt <= sinceMs) {
            continue
        }
        const conversationId = signal.conversationId ?? signal.sourceRef?.match(/^conversation:([^#]+)/)?.[1]
        if (conversationId) {
            conversations.add(conversationId)
        }
    }
    return conversations.size
}
