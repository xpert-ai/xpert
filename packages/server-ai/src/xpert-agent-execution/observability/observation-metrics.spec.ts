import { observationOverlap, summarizeObservations, type ObservationFact } from './observation-metrics'

const start = Date.parse('2026-10-27T02:00:00Z')
const stamp = (minute: number) => new Date(start + minute * 60000).toISOString()
function fact(
    id: string,
    from: number,
    to: number | null,
    status: ObservationFact['status'] = 'success'
): ObservationFact {
    return {
        id,
        assistantId: 'assistant',
        conversationId: 'conversation',
        createdAt: stamp(from),
        completedAt: to === null ? null : stamp(to),
        status,
        elapsedTimeMs: to === null ? null : (to - from) * 60000
    }
}

describe('execution record analytics', () => {
    it('preserves idle gaps, clips window edges and merges equal adjacent counts without a false tie peak', () => {
        const rows = [fact('a', -10, 5), fact('b', 5, 10), fact('c', 8, 12), fact('d', 20, null, 'running')]
        expect(observationOverlap(rows, start, start + 30 * 60000, start + 25 * 60000)).toEqual([
            { start: stamp(0), end: stamp(8), count: 1 },
            { start: stamp(8), end: stamp(10), count: 2 },
            { start: stamp(10), end: stamp(12), count: 1 },
            { start: stamp(20), end: stamp(25), count: 1 }
        ])
    })
    it('never extends stopped unknown-end, pending or interrupted records to now', () => {
        const rows = [
            fact('unknown', 0, null),
            fact('pending', 1, null, 'pending'),
            fact('wait', 2, null, 'interrupted')
        ]
        const summary = summarizeObservations(rows, start, start + 60 * 60000, start + 40 * 60000, stamp(40))
        expect(summary.overlap).toEqual([])
        expect(summary.unknownEnds).toBe(3)
        expect(summary.phaseCoverage).toBe('unavailable')
    })
    it('keeps zero-duration events in counts without inventing positive concurrency', () => {
        const summary = summarizeObservations(
            [fact('point', 10, 10)],
            start,
            start + 20 * 60000,
            start + 20 * 60000,
            stamp(20)
        )
        expect(summary.total).toBe(1)
        expect(summary.peakOverlap).toBe(0)
        expect(summary.p95ElapsedMs).toBe(0)
    })
    it('excludes unfinished/interrupted records from completion success denominator and duration quantiles', () => {
        const rows = [
            fact('success', 0, 1),
            fact('error', 0, 2, 'error'),
            fact('timeout', 0, 4, 'timeout'),
            fact('interrupt', 0, 90, 'interrupted'),
            fact('live', 0, null, 'running')
        ]
        const summary = summarizeObservations(rows, start, start + 120 * 60000, start + 100 * 60000, stamp(100))
        expect(summary.successRate).toBeCloseTo(1 / 3)
        expect(summary.durationSamples).toBe(3)
        expect(summary.p95ElapsedMs).toBe(4 * 60000)
        expect(summary.usage.totalTokens).toBeNull()
    })
})
