import { FileMemorySignal } from './types'
import { FILE_MEMORY_SIGNAL_WEIGHTS } from './signals'

export type FileMemoryDreamCandidateScoreInput = {
    signals: FileMemorySignal[]
    uniqueConversationCount?: number
    uniqueQueryCount?: number
    sourceQualityScore?: number
    recencyScore?: number
    actionabilityScore?: number
    conflictScore?: number
    coverageScore?: number
}

export function calculateDreamCandidateScore(input: FileMemoryDreamCandidateScoreInput) {
    const signalScore = calculateSignalScore(input.signals)
    const recurrenceScore = Math.min(
        1,
        (boundedLog(input.uniqueConversationCount ?? 0, 8) + boundedLog(input.uniqueQueryCount ?? 0, 12)) / 2
    )

    return roundScore(
        0.24 * signalScore +
            0.18 * recurrenceScore +
            0.16 * normalizeScore(input.sourceQualityScore) +
            0.14 * normalizeScore(input.recencyScore) +
            0.12 * normalizeScore(input.actionabilityScore) +
            0.08 * normalizeScore(input.conflictScore) +
            0.08 * normalizeScore(input.coverageScore)
    )
}

export function classifyDreamCandidateScore(score: number) {
    if (score >= 0.82) {
        return 'evidence' as const
    }
    if (score >= 0.65) {
        return 'observe' as const
    }
    if (score >= 0.45) {
        return 'report' as const
    }
    return 'discard' as const
}

function calculateSignalScore(signals: FileMemorySignal[]) {
    if (!signals.length) {
        return 0
    }

    const total = signals.reduce((sum, signal) => sum + (signal.weight ?? FILE_MEMORY_SIGNAL_WEIGHTS[signal.type]), 0)
    return Math.min(1, total / 5)
}

function boundedLog(value: number, max: number) {
    return Math.min(1, Math.log1p(Math.max(0, value)) / Math.log1p(max))
}

function normalizeScore(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0
}

function roundScore(value: number) {
    return Math.max(0, Math.min(1, Number(value.toFixed(4))))
}
