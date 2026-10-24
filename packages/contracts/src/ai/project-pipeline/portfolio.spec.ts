import { aggregatePipelineAnalytics, projectPipelineAnalytics, type PipelineAnalyticsInstanceFacts } from './analytics'
import { projectPipelinePortfolioInputSchema, projectPipelinePortfolioSchema } from './portfolio.schema'
import type { PipelineAttemptFact } from './execution-statistics'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const window = { from: '2026-10-18T00:00:00Z', to: '2026-10-19T00:00:00Z' }
const instance = (n: number): PipelineAnalyticsInstanceFacts => {
  const node = {
    taskIds: [id(n)],
    projection: {
      key: id(n),
      nodeKey: id(n),
      expansionKey: '',
      title: 'Work',
      kind: 'work' as const,
      laneKey: 'worker',
      stageKey: 'check',
      taskKeys: [id(n)],
      evidence: [],
      state: {
        lifecycle: 'active' as const,
        readiness: 'ready' as const,
        applicability: 'selected' as const,
        freshness: 'current' as const,
        runtime: 'running' as const
      }
    }
  }
  return {
    id: id(n),
    title: 'Pipeline',
    templateKey: 'neutral',
    templateVersion: '1.0.0',
    authority: 'provider',
    runState: 'active',
    currentNodes: [node],
    historyNodes: [node]
  }
}
const attempt = (n: number, seconds: number): PipelineAttemptFact => ({
  id: id(n),
  taskId: id(n),
  status: 'succeeded',
  runtimeStartedAt: window.from,
  runtimeCompletedAt: new Date(Date.parse(window.from) + seconds * 1000).toISOString()
})

it('recomputes weighted success and P95 from all execution facts', () => {
  const facts = [1, 2, 3].map(instance),
    executions = [attempt(1, 1), attempt(2, 2), { ...attempt(3, 10), status: 'failed' as const }]
  const data = aggregatePipelineAnalytics(facts, executions, window, window.to)
  expect(data.executions.attempts.successRate).toBe(2 / 3)
  expect(data.executions.timing).toMatchObject({ meanMs: 13000 / 3, p95Ms: 10000 })
})
it('deduplicates shared native and invocation identities across Projects', () => {
  const facts = [1, 2, 3, 4].map(instance),
    executions = [
      { ...attempt(1, 1), agentExecutionId: id(10) },
      { ...attempt(2, 1), agentExecutionId: id(10) },
      { ...attempt(3, 2), invocationId: id(11) },
      { ...attempt(4, 2), invocationId: id(11) }
    ]
  const data = aggregatePipelineAnalytics(facts, executions, window, window.to)
  expect(data.executions.attempts.total).toBe(2)
  expect(data.coverage.sharedAcrossInstances).toBe(2)
  expect(data.executions.timing.totalMs).toBe(3000)
})
it('keeps empty execution statistics unknown and excludes meaningless portfolio interval totals', () => {
  const { byInstance: _rows, ...totals } = aggregatePipelineAnalytics([], [], window, window.to)
  const data = {
    snapshotAt: window.to,
    window,
    selectionScope: 'explicit_authorized_projects',
    totals,
    byProject: [projectPipelineAnalytics(id(1), [], [], window, window.to)],
    sharedAcrossProjects: 0
  }
  expect(projectPipelinePortfolioSchema.parse(data).totals.executions.timing.p95Ms).toBeNull()
  expect(projectPipelinePortfolioSchema.safeParse({ ...data, totals: { ...totals, humanWait: {} } }).success).toBe(
    false
  )
})
it.each(
  [[], [id(1), id(1)], ['bad'], Array.from({ length: 51 }, (_, i) => id(i + 1))].map((projectIds) => ({ projectIds }))
)('rejects invalid project selections', ({ projectIds }) => {
  expect(projectPipelinePortfolioInputSchema.safeParse({ projectIds, window }).success).toBe(false)
})
it.each([
  { projectIds: [id(1)], window, tenantId: id(2) },
  { projectIds: [id(1)], window: { ...window, to: window.from } }
])('rejects scope overrides and invalid windows', (input) =>
  expect(projectPipelinePortfolioInputSchema.safeParse(input).success).toBe(false)
)
