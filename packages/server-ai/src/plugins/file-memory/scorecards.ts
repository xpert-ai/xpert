import { FileMemoryScorecardCandidate, FileMemorySignal } from './types'
import { calculateFileMemoryUsefulnessScore, createDefaultFileMemoryUsage } from './usage'
import { calculateDreamCandidateScore, classifyDreamCandidateScore } from './scoring'

export function calculateUsageFromSignals(signals: FileMemorySignal[], now = new Date().toISOString()) {
    const usage = createDefaultFileMemoryUsage()
    const conversationIds = new Set<string>()
    const queryHashes = new Set<string>()

    for (const signal of signals) {
        switch (signal.type) {
            case 'recall_hit':
                usage.recallCount += 1
                usage.lastRecalledAt = maxIsoDate(usage.lastRecalledAt, signal.createdAt)
                if (signal.conversationId) {
                    conversationIds.add(signal.conversationId)
                }
                if (signal.queryHash) {
                    queryHashes.add(signal.queryHash)
                }
                break
            case 'detail_read':
                usage.detailReadCount += 1
                usage.lastDetailReadAt = maxIsoDate(usage.lastDetailReadAt, signal.createdAt)
                break
            case 'explicit_write':
                usage.explicitWriteCount += 1
                break
            case 'writeback_candidate':
                usage.writebackCandidateCount += 1
                break
            case 'user_correction':
                usage.correctionCount += 1
                break
            case 'index_issue':
                break
        }
    }

    usage.uniqueConversationCount = conversationIds.size
    usage.uniqueQueryCount = queryHashes.size
    usage.usefulnessScore = calculateFileMemoryUsefulnessScore(usage, now)
    return usage
}

export function groupSignalsByMemory(signals: FileMemorySignal[]) {
    const groups = new Map<string, FileMemorySignal[]>()
    for (const signal of signals) {
        if (!signal.memoryId) {
            continue
        }
        const group = groups.get(signal.memoryId) ?? []
        group.push(signal)
        groups.set(signal.memoryId, group)
    }
    return groups
}

export function buildCandidateScorecards(signals: FileMemorySignal[]): FileMemoryScorecardCandidate[] {
    const groups = new Map<string, FileMemorySignal[]>()
    for (const signal of signals) {
        if (
            signal.type !== 'writeback_candidate' &&
            signal.type !== 'user_correction' &&
            signal.type !== 'index_issue'
        ) {
            continue
        }
        const key = signal.memoryId ?? signal.sourceRef ?? signal.conversationId ?? signal.relativePath ?? signal.id
        const group = groups.get(key) ?? []
        group.push(signal)
        groups.set(key, group)
    }

    return Array.from(groups.entries())
        .map(([key, group]) => {
            const uniqueConversationCount = new Set(group.map((signal) => signal.conversationId).filter(Boolean)).size
            const uniqueQueryCount = new Set(group.map((signal) => signal.queryHash).filter(Boolean)).size
            const score = calculateDreamCandidateScore({
                signals: group,
                uniqueConversationCount,
                uniqueQueryCount,
                sourceQualityScore: calculateSourceQualityScore(group),
                recencyScore: calculateSignalRecencyScore(latestSignalAt(group)),
                actionabilityScore: group.some((signal) => Boolean(signal.metadata)) ? 0.8 : 0.4,
                conflictScore: group.some(
                    (signal) => signal.type === 'user_correction' || signal.type === 'index_issue'
                )
                    ? 1
                    : 0.2,
                coverageScore: Math.min(1, group.length / 3)
            })
            const latest = [...group].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
            return {
                key,
                score,
                classification: classifyDreamCandidateScore(score),
                signalCount: group.length,
                uniqueConversationCount,
                uniqueQueryCount,
                lastSignalAt: latest?.createdAt,
                sourceRef: latest?.sourceRef,
                conversationId: latest?.conversationId
            }
        })
        .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key))
}

export function countSignals(signals: FileMemorySignal[]) {
    return signals.reduce<Partial<Record<FileMemorySignal['type'], number>>>((counts, signal) => {
        counts[signal.type] = (counts[signal.type] ?? 0) + 1
        return counts
    }, {})
}

export function latestSignalAt(signals: FileMemorySignal[]) {
    return signals.reduce<string | undefined>((latest, signal) => maxIsoDate(latest, signal.createdAt), undefined)
}

function maxIsoDate(left: string | undefined, right: string | undefined) {
    if (!right) {
        return left
    }
    if (!left) {
        return right
    }
    return right > left ? right : left
}

function calculateSourceQualityScore(signals: FileMemorySignal[]) {
    if (signals.some((signal) => signal.type === 'user_correction')) {
        return 1
    }
    if (signals.some((signal) => signal.type === 'writeback_candidate')) {
        return 0.65
    }
    return signals.length ? 0.4 : 0
}

function calculateSignalRecencyScore(value?: string) {
    if (!value) {
        return 0
    }
    const then = new Date(value).getTime()
    const now = Date.now()
    if (!Number.isFinite(then) || then > now) {
        return 0
    }
    const halfLifeDays = 14
    const ageDays = (now - then) / 86_400_000
    return Math.max(0, Math.min(1, Math.pow(0.5, ageDays / halfLifeDays)))
}
