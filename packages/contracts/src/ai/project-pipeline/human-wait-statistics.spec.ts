import {
  pipelineHumanWaitStatistics,
  pipelineHumanWaitStatisticsSchema,
  type PipelineHumanWaitEvent
} from './human-wait-statistics'
import { pipelineHumanWaitSnapshotSchema } from './human-wait.schema'

const origin = Date.parse('2026-10-19T00:00:00.000Z')
const at = (seconds: number) => new Date(origin + seconds * 1000).toISOString()
const a = '00000000-0000-4000-8000-000000000001',
  b = '00000000-0000-4000-8000-000000000002'
const event = (
  revision: number,
  seconds: number,
  nodeIds: string[],
  instanceId = 'instance'
): PipelineHumanWaitEvent => ({
  instanceId,
  revision,
  snapshot: { schemaVersion: 1, observedAt: at(seconds), nodeIds }
})
const read = (events: PipelineHumanWaitEvent[], waiting: string[] = [], from = 0, to = 30, now = 30) =>
  pipelineHumanWaitStatistics(events, waiting, { from: at(from), to: at(to) }, at(now))

it('keeps repeated observations in one interval and records a reopened wait separately', () => {
  const data = pipelineHumanWaitStatisticsSchema.parse(
    read([event(1, 0, []), event(2, 1, [a]), event(3, 5, [a]), event(4, 10, []), event(5, 12, [a])], [a], 0, 20, 20)
  )
  expect(data).toMatchObject({ intervals: 2, ongoing: 1, censored: 0, observedNodeMs: 17000, observedUnionMs: 17000 })
})
it('reports overlapping human-ready time as a union rather than summed labor hours', () => {
  const data = read([event(1, 0, [a]), event(2, 5, [a, b]), event(3, 10, [b]), event(4, 15, [])])
  expect(data).toMatchObject({ intervals: 2, censored: 1, observedNodeMs: 20000, observedUnionMs: 15000 })
})
it('clips observed intervals to the selected time window', () => {
  expect(read([event(1, 0, [a]), event(2, 10, [])], [], 5, 15)).toMatchObject({
    observedNodeMs: 5000,
    observedUnionMs: 5000
  })
})
it('does not invent a start before the first new observation in legacy history', () => {
  const data = read([{ instanceId: 'instance', revision: 1, snapshot: null }, event(2, 10, [a]), event(3, 20, [])])
  expect(data).toMatchObject({ intervals: 1, censored: 1, observedNodeMs: 10000, coverage: { missingEvents: 1 } })
})
it('breaks continuity on missing events instead of bridging an unknown period', () => {
  const data = read([
    event(1, 0, [a]),
    event(2, 5, [a]),
    { instanceId: 'instance', revision: 3, snapshot: null },
    event(4, 15, [a]),
    event(5, 20, [])
  ])
  expect(data).toMatchObject({
    intervals: 2,
    censored: 2,
    observedNodeMs: 10000,
    coverage: { missingEvents: 1, observedWindowMs: 20000 }
  })
})
it('does not extend a stale open observation when the current node is no longer waiting', () => {
  expect(read([event(1, 0, [a]), event(2, 5, [a])])).toMatchObject({
    intervals: 1,
    ongoing: 0,
    censored: 1,
    observedNodeMs: 5000,
    coverage: { observedWindowMs: 5000 }
  })
})
it('reports current waiting nodes without a recorded start separately', () => {
  expect(read([], [a])).toMatchObject({
    observedNodeMs: null,
    observedUnionMs: null,
    coverage: { currentUntrackedNodes: 1 }
  })
})
it.each([event(2, -1, [a]), event(2, 31, [a]), { instanceId: 'instance', revision: 2, snapshot: null, invalid: true }])(
  'rejects invalid, reversed and future observations without extending a wait',
  (invalid) => {
    const data = read([event(1, 0, [a]), invalid], [a])
    expect(data.coverage).toMatchObject({ invalidEvents: 1, currentUntrackedNodes: 1 })
    expect(data.observedNodeMs).toBeNull()
  }
)
it('breaks continuity across deleted or absent event revisions', () => {
  expect(read([event(1, 0, [a]), event(2, 5, [a]), event(4, 15, []), event(5, 20, [])])).toMatchObject({
    observedNodeMs: 5000,
    censored: 1,
    coverage: { invalidEvents: 1 }
  })
})
it('keeps an entirely unobserved window unavailable and a measured empty window at zero', () => {
  expect(read([event(1, 20, [])], [], 0, 10).observedNodeMs).toBeNull()
  expect(read([event(1, 0, [])]).observedNodeMs).toBe(0)
})
it('unions observed wait across independent instances without merging their node intervals', () => {
  expect(
    read([event(1, 0, [a], 'one'), event(2, 10, [], 'one'), event(1, 5, [b], 'two'), event(2, 15, [], 'two')])
  ).toMatchObject({ intervals: 2, observedNodeMs: 20000, observedUnionMs: 15000 })
})
it('rejects duplicate or malformed snapshot identities at the persistence boundary', () => {
  expect(
    pipelineHumanWaitSnapshotSchema.safeParse({ schemaVersion: 1, observedAt: at(0), nodeIds: [a, a] }).success
  ).toBe(false)
  expect(
    pipelineHumanWaitSnapshotSchema.safeParse({ schemaVersion: 1, observedAt: at(0), nodeIds: ['foreign'] }).success
  ).toBe(false)
})
