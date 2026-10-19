import { pipelineQueueStatistics, pipelineQueueStatisticsSchema, type PipelineQueueFact } from './queue-statistics'

const from = '2026-10-18T00:00:00.000Z',
  to = '2026-10-19T00:00:00.000Z'
const at = (seconds: number) => new Date(Date.parse(from) + seconds * 1000).toISOString()
const fact = (patch: Partial<PipelineQueueFact> = {}): PipelineQueueFact => ({
  id: 'first',
  source: 'managed_operation',
  createdAt: from,
  dispatchStartedAt: at(2),
  waiting: false,
  ...patch
})
const stats = (facts: PipelineQueueFact[], snapshotAt = at(100)) =>
  pipelineQueueStatistics(facts, { from, to }, snapshotAt)

it('measures first dispatch separately from still queued work and unknown outcomes', () => {
  const data = pipelineQueueStatisticsSchema.parse(
    stats([
      fact(),
      fact({ id: 'pending', dispatchStartedAt: null, waiting: true }),
      fact({ id: 'unknown', dispatchStartedAt: null })
    ])
  )
  expect(data.total).toEqual({
    total: 3,
    dispatched: 1,
    queued: 1,
    unavailable: 1,
    dispatchWait: { samples: 1, unavailable: 2, totalMs: 2000, meanMs: 2000, medianMs: 2000, p95Ms: 2000 },
    pendingWait: { samples: 1, totalMs: 100000, oldestMs: 100000 }
  })
})
it('uses creation cohort with inclusive start and exclusive end, not runtime start', () => {
  const data = stats([
    fact(),
    fact({ id: 'outside', createdAt: to }),
    fact({ id: 'old', createdAt: at(-1) }),
    fact({ id: 'missing', createdAt: null }),
    fact({ id: 'invalid', createdAt: 'invalid' })
  ])
  expect(data.coverage).toEqual({ recorded: 5, missingCreatedAt: 2, outsideWindow: 2 })
  expect(data.total.total).toBe(1)
})
it('deduplicates the same outbox record while retaining separate dispatch sources', () => {
  const data = stats([fact(), fact(), fact({ source: 'provider_action', dispatchStartedAt: at(8) })])
  expect(data.total.dispatchWait).toMatchObject({ samples: 2, meanMs: 5000, medianMs: 5000, p95Ms: 8000 })
  expect(data.bySource.map((group) => group.metrics.total)).toEqual([1, 1])
})
it.each([at(-1), at(101), 'invalid'])('excludes invalid or future dispatch interval %s', (dispatchStartedAt) => {
  expect(stats([fact({ dispatchStartedAt, waiting: true })]).total).toMatchObject({
    dispatched: 0,
    queued: 0,
    unavailable: 1
  })
})
it('does not count a future-created queued row as a valid wait', () => {
  expect(stats([fact({ createdAt: at(101), dispatchStartedAt: null, waiting: true })]).total).toMatchObject({
    queued: 0,
    unavailable: 1
  })
})
it('keeps real zero waits and does not turn missing or empty data into zero waits', () => {
  expect(stats([fact({ dispatchStartedAt: from })]).total.dispatchWait).toMatchObject({ samples: 1, totalMs: 0 })
  expect(stats([fact({ dispatchStartedAt: null })]).total.dispatchWait.totalMs).toBeNull()
  expect(stats([]).total.pendingWait).toEqual({ samples: 0, totalMs: null, oldestMs: null })
})
it('does not truncate completed waits to the selected creation window', () => {
  const data = stats([fact({ dispatchStartedAt: at(90000) })], at(90001))
  expect(data.total.dispatchWait.totalMs).toBe(90000000)
})
