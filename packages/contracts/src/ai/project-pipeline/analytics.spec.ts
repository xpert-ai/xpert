import {
  projectPipelineAnalytics,
  projectPipelineAnalyticsInputSchema,
  projectPipelineAnalyticsSchema,
  type PipelineAnalyticsInstanceFacts
} from './analytics'
import type { PipelineAttemptFact } from './execution-statistics'

const from = '2026-10-18T00:00:00.000Z',
  to = '2026-10-19T00:00:00.000Z'
const instance = (id: string, taskId = id): PipelineAnalyticsInstanceFacts => {
  const node = {
    taskIds: [taskId],
    projection: {
      key: id,
      nodeKey: id,
      expansionKey: '',
      title: id,
      kind: 'human_gate' as const,
      laneKey: 'owner',
      stageKey: 'check',
      taskKeys: [taskId],
      evidence: [],
      state: {
        lifecycle: 'pending' as const,
        readiness: 'ready' as const,
        applicability: 'selected' as const,
        freshness: 'current' as const,
        runtime: 'none' as const
      }
    }
  }
  return {
    id,
    title: id,
    templateKey: 'neutral',
    templateVersion: '1.0.0',
    authority: 'provider',
    runState: 'active',
    currentNodes: [node],
    historyNodes: [node]
  }
}
const project = '00000000-0000-4000-8000-000000000001',
  first = '00000000-0000-4000-8000-000000000002',
  second = '00000000-0000-4000-8000-000000000003'
const fact = (taskId: string, patch: Partial<PipelineAttemptFact> = {}): PipelineAttemptFact => ({
  id: taskId,
  taskId,
  status: 'succeeded',
  runtimeStatus: 'succeeded',
  runtimeStartedAt: from,
  runtimeCompletedAt: '2026-10-18T00:00:01.000Z',
  ...patch
})

it('keeps current human approval separate from successful execution cohorts', () => {
  const data = projectPipelineAnalytics(project, [instance(first)], [fact(first)], { from, to }, to)
  expect(projectPipelineAnalyticsSchema.parse(data).current).toMatchObject({
    work: { total: 0 },
    business: { total: 1, completed: 0 },
    needsYou: 1
  })
  expect(data.executions).toMatchObject({ attempts: { total: 1, succeeded: 1 }, timing: { totalMs: 1000 } })
})
it('includes available historical attempts even if that business path is now excluded', () => {
  const data = instance(first),
    previous = instance(second).historyNodes[0]
  previous.projection.state.applicability = 'excluded'
  previous.projection.state.freshness = 'superseded'
  data.historyNodes.push(previous)
  const analytics = projectPipelineAnalytics(project, [data], [fact(first), fact(second)], { from, to }, to)
  expect(analytics.current.business.total).toBe(1)
  expect(analytics.executions.attempts.total).toBe(2)
})
it('uses inclusive start, exclusive end and reports missing timestamps instead of zero duration', () => {
  const items = [first, second, 'old', 'missing', 'invalid'].map((id) => instance(id))
  const analytics = projectPipelineAnalytics(
    project,
    items,
    [
      fact(first),
      fact(second, { runtimeStartedAt: to }),
      fact('old', { runtimeStartedAt: '2026-10-17T23:59:59.999Z' }),
      fact('missing', { runtimeStartedAt: null }),
      fact('invalid', { runtimeStartedAt: 'invalid' })
    ],
    { from, to },
    to
  )
  expect(analytics.executions.attempts.total).toBe(1)
  expect(analytics.coverage).toMatchObject({
    recordedAttempts: 5,
    attemptsWithoutStartTime: 2,
    attemptsOutsideWindow: 2
  })
})
it('deduplicates shared native executions globally while exposing overlapping instance attribution', () => {
  const analytics = projectPipelineAnalytics(
    project,
    [instance(first), instance(second)],
    [fact(first, { agentExecutionId: 'native' }), fact(second, { agentExecutionId: 'native' }), fact('unrelated')],
    { from, to },
    to
  )
  expect(analytics.executions.attempts.total).toBe(1)
  expect(analytics.byInstance.map((item) => item.executions.attempts.total)).toEqual([1, 1])
  expect(analytics.coverage.sharedAcrossInstances).toBe(1)
})
it('keeps undated queued work outside the start-time cohort and empty samples unknown', () => {
  const analytics = projectPipelineAnalytics(
    project,
    [instance(first)],
    [fact(first, { runtimeStartedAt: null, status: 'queued', runtimeStatus: 'queued' })],
    { from, to },
    to,
    1
  )
  expect(analytics.executions.attempts.total).toBe(0)
  expect(analytics.executions.timing.meanMs).toBeNull()
  expect(analytics.coverage).toMatchObject({ attemptsWithoutStartTime: 1, instancesWithoutCurrentRound: 1 })
})
it.each([
  { from: to, to: from },
  { from, to: from },
  { from: '2026-01-01T00:00:00Z', to },
  { from, to, actor: 'forged' }
])('rejects invalid or unbounded query windows', (input) =>
  expect(() => projectPipelineAnalyticsInputSchema.parse(input)).toThrow()
)
