import type {
    ExecutionObservationRecord,
    ExecutionObservationSegment,
    ExecutionObservationSummary
} from '@xpert-ai/contracts'

export type ObservationFact = Pick<
    ExecutionObservationRecord,
    'id' | 'assistantId' | 'conversationId' | 'status' | 'createdAt' | 'completedAt' | 'elapsedTimeMs'
>

/** Lifecycle envelopes are not active-resource intervals: interruptions/resumes have no complete historical ledger. */
export function observationInterval(record: ObservationFact, from: number, to: number, asOf: number) {
    const start = Date.parse(record.createdAt)
    const end = record.completedAt ? Date.parse(record.completedAt) : record.status === 'running' ? asOf : null
    if (end === null || end < start || start >= to || end < from) return null
    return { start: Math.max(start, from), end: Math.min(end, to, asOf) }
}

export function observationOverlap(
    records: ObservationFact[],
    from: number,
    to: number,
    asOf: number
): ExecutionObservationSegment[] {
    const changes = new Map<number, number>()
    for (const record of records) {
        const interval = observationInterval(record, from, to, asOf)
        if (!interval || interval.end <= interval.start) continue
        changes.set(interval.start, (changes.get(interval.start) ?? 0) + 1)
        changes.set(interval.end, (changes.get(interval.end) ?? 0) - 1)
    }
    const times = [...changes.keys()].sort((a, b) => a - b)
    const segments: ExecutionObservationSegment[] = []
    let count = 0
    for (let index = 0; index < times.length - 1; index++) {
        count += changes.get(times[index]) ?? 0
        if (count <= 0) continue
        const start = new Date(times[index]).toISOString(),
            end = new Date(times[index + 1]).toISOString()
        const previous = segments.at(-1)
        if (previous?.count === count && previous.end === start) previous.end = end
        else segments.push({ start, end, count })
    }
    return segments
}

export function emptyObservationUsage(): ExecutionObservationSummary['usage'] {
    return {
        records: 0,
        totalTokens: null,
        unpricedRecords: 0,
        currencies: [],
        basis: 'direct_execution_ledger',
        coveredExecutions: 0
    }
}

export function summarizeObservations(
    records: ObservationFact[],
    from: number,
    to: number,
    asOf: number,
    observedAt: string
): ExecutionObservationSummary {
    const statuses: ExecutionObservationSummary['statuses'] = {
        running: 0,
        success: 0,
        error: 0,
        pending: 0,
        timeout: 0,
        interrupted: 0,
        unknown: 0
    }
    const durations: number[] = []
    let knownIntervals = 0,
        unknownEnds = 0
    for (const record of records) {
        statuses[record.status]++
        if (observationInterval(record, from, to, asOf)) knownIntervals++
        else unknownEnds++
        if (
            ['success', 'error', 'timeout'].includes(record.status) &&
            record.elapsedTimeMs !== null &&
            record.elapsedTimeMs >= 0
        )
            durations.push(record.elapsedTimeMs)
    }
    durations.sort((a, b) => a - b)
    const quantile = (ratio: number) =>
        durations.length ? durations[Math.max(0, Math.ceil(durations.length * ratio) - 1)] : null
    const overlap = observationOverlap(records, from, to, asOf)
    const finished = statuses.success + statuses.error + statuses.timeout
    return {
        total: records.length,
        assistants: new Set(records.map((r) => r.assistantId)).size,
        conversations: new Set(records.map((r) => r.conversationId).filter(Boolean)).size,
        statuses,
        successRate: finished ? statuses.success / finished : null,
        p50ElapsedMs: quantile(0.5),
        p95ElapsedMs: quantile(0.95),
        durationSamples: durations.length,
        peakOverlap: overlap.reduce((peak, segment) => Math.max(peak, segment.count), 0),
        overlap,
        knownIntervals,
        unknownEnds,
        timingBasis: 'record_lifecycle',
        phaseCoverage: 'unavailable',
        observedAt,
        asOf: new Date(asOf).toISOString(),
        usage: emptyObservationUsage()
    }
}
