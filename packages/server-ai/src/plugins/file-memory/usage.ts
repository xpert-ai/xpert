import { FileMemorySignal, FileMemoryUsage } from './types'

export function createDefaultFileMemoryUsage(): FileMemoryUsage {
    return {
        recallCount: 0,
        detailReadCount: 0,
        explicitWriteCount: 0,
        writebackCandidateCount: 0,
        correctionCount: 0,
        uniqueConversationCount: 0,
        uniqueQueryCount: 0,
        usefulnessScore: 0
    }
}

export function mergeFileMemoryUsage(value?: Partial<FileMemoryUsage> | null): FileMemoryUsage {
    return {
        ...createDefaultFileMemoryUsage(),
        ...(value ?? {}),
        recallCount: normalizeCount(value?.recallCount),
        detailReadCount: normalizeCount(value?.detailReadCount),
        explicitWriteCount: normalizeCount(value?.explicitWriteCount),
        writebackCandidateCount: normalizeCount(value?.writebackCandidateCount),
        correctionCount: normalizeCount(value?.correctionCount),
        uniqueConversationCount: normalizeCount(value?.uniqueConversationCount),
        uniqueQueryCount: normalizeCount(value?.uniqueQueryCount),
        usefulnessScore: normalizeScore(value?.usefulnessScore)
    }
}

export function applyFileMemorySignalToUsage(
    usage: Partial<FileMemoryUsage> | undefined,
    signal: FileMemorySignal,
    now = signal.createdAt
): FileMemoryUsage {
    const next = mergeFileMemoryUsage(usage)

    switch (signal.type) {
        case 'recall_hit':
            next.recallCount += 1
            next.lastRecalledAt = now
            if (signal.conversationId) {
                next.uniqueConversationCount += 1
            }
            if (signal.queryHash) {
                next.uniqueQueryCount += 1
            }
            break
        case 'detail_read':
            next.detailReadCount += 1
            next.lastDetailReadAt = now
            break
        case 'explicit_write':
            next.explicitWriteCount += 1
            break
        case 'writeback_candidate':
            next.writebackCandidateCount += 1
            break
        case 'user_correction':
            next.correctionCount += 1
            break
        case 'index_issue':
            break
    }

    next.usefulnessScore = calculateFileMemoryUsefulnessScore(next, now)
    return next
}

export function calculateFileMemoryUsefulnessScore(usage: Partial<FileMemoryUsage>, now = new Date().toISOString()) {
    const normalized = mergeFileMemoryUsage(usage)
    const normalizedRecall = boundedLog(normalized.recallCount, 20)
    const normalizedDetailRead = boundedLog(normalized.detailReadCount, 10)
    const recurrenceScore = Math.min(
        1,
        (boundedLog(normalized.uniqueConversationCount, 8) + boundedLog(normalized.uniqueQueryCount, 12)) / 2
    )
    const recencyScore = calculateRecencyScore(normalized.lastDetailReadAt ?? normalized.lastRecalledAt, now)
    const sourceQualityScore = calculateSourceQualityScore(normalized)
    const correctionPenalty = Math.min(1, normalized.correctionCount / 5)

    return roundScore(
        0.3 * normalizedRecall +
            0.24 * normalizedDetailRead +
            0.18 * recurrenceScore +
            0.14 * recencyScore +
            0.1 * sourceQualityScore -
            0.12 * correctionPenalty
    )
}

function calculateSourceQualityScore(usage: FileMemoryUsage) {
    const explicit = usage.explicitWriteCount > 0 ? 1 : 0
    const detail = usage.detailReadCount > 0 ? 0.7 : 0
    const writeback = usage.writebackCandidateCount > 0 ? 0.35 : 0
    return Math.max(explicit, detail, writeback)
}

function calculateRecencyScore(value?: string, now = new Date().toISOString()) {
    if (!value) {
        return 0
    }

    const then = new Date(value).getTime()
    const current = new Date(now).getTime()
    if (!Number.isFinite(then) || !Number.isFinite(current) || then > current) {
        return 0
    }

    const halfLifeDays = 30
    const ageDays = (current - then) / 86_400_000
    return Math.max(0, Math.min(1, Math.pow(0.5, ageDays / halfLifeDays)))
}

function boundedLog(value: number, max: number) {
    return Math.min(1, Math.log1p(Math.max(0, value)) / Math.log1p(max))
}

function normalizeCount(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

function normalizeScore(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? roundScore(value) : 0
}

function roundScore(value: number) {
    return Math.max(0, Math.min(1, Number(value.toFixed(4))))
}
