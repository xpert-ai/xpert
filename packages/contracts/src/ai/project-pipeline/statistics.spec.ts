import { projectPipelineStatistics } from './statistics'
import type { ProjectPipelineProjectionNode } from './projection.schema'

const node = (key: string, patch: Partial<ProjectPipelineProjectionNode> = {}) => ({
  taskIds: [key],
  projection: {
    key,
    nodeKey: key,
    expansionKey: '',
    title: key,
    kind: 'work' as const,
    laneKey: 'analyst',
    stageKey: 'analysis',
    state: {
      lifecycle: 'active' as const,
      readiness: 'ready' as const,
      applicability: 'selected' as const,
      freshness: 'current' as const,
      runtime: 'running' as const
    },
    taskKeys: [key],
    evidence: [],
    ...patch
  }
})
const state = node('work').projection.state

describe('Pipeline snapshot statistics', () => {
  it('counts drafting executions on human gates without treating them as business approval', () => {
    const nodes = [
      node('gate', { kind: 'human_gate', state: { ...state, runtime: 'succeeded' } }),
      node('external', { kind: 'external_wait', state: { ...state, lifecycle: 'completed', runtime: 'none' } }),
      node('control', { kind: 'router' }),
      node('excluded', { kind: 'human_gate', state: { ...state, applicability: 'excluded' } })
    ]
    const stats = projectPipelineStatistics(nodes, [
      { id: 'draft', taskId: 'gate', status: 'succeeded', agentExecutionId: 'native-draft', xpertId: 'drafter' },
      { id: 'external', taskId: 'external', status: 'succeeded', runtimeProvider: 'pipeline-service' },
      { id: 'control', taskId: 'control', status: 'succeeded' },
      { id: 'excluded', taskId: 'excluded', status: 'succeeded' }
    ])
    expect(stats.work.total).toBe(0)
    expect(stats.business).toMatchObject({ total: 2, completed: 1 })
    expect(stats.attempts).toMatchObject({ total: 2, succeeded: 2 })
    expect(stats.byExecutor).toHaveLength(2)
    expect(stats.needsYou).toBe(1)
  })

  it('counts actionable pending gates without counting waiting, terminal or unselected gates', () => {
    const gate = {
      kind: 'human_gate' as const,
      state: { ...state, lifecycle: 'pending' as const, runtime: 'none' as const }
    }
    const stats = projectPipelineStatistics(
      [
        node('ready', gate),
        node('waiting', { ...gate, state: { ...gate.state, readiness: 'waiting' } }),
        node('resolved', { ...gate, state: { ...gate.state, lifecycle: 'completed' } }),
        node('unselected', { ...gate, state: { ...gate.state, applicability: 'undetermined' } })
      ],
      []
    )
    expect(stats.needsYou).toBe(1)
  })
  it('counts selected current work separately from controls, gates, excluded and historical nodes', () => {
    const stats = projectPipelineStatistics(
      [
        node('accepted', { state: { ...state, lifecycle: 'completed', runtime: 'succeeded' } }),
        node('cancelled', { state: { ...state, lifecycle: 'cancelled', runtime: 'cancelled', readiness: 'blocked' } }),
        node('rejected', { state: { ...state, lifecycle: 'failed', runtime: 'succeeded', readiness: 'blocked' } }),
        node('unknown', { laneKey: 'verifier', state: { ...state, readiness: 'blocked', runtime: 'unknown' } }),
        node('control', { kind: 'terminal', state: { ...state, lifecycle: 'completed', runtime: 'none' } }),
        node('gate', { kind: 'human_gate', state: { ...state, runtime: 'none' } }),
        node('excluded', { state: { ...state, applicability: 'excluded' } }),
        node('undetermined', { state: { ...state, applicability: 'undetermined' } }),
        node('old', { state: { ...state, freshness: 'superseded' } })
      ],
      []
    )
    expect(stats.work).toEqual({ total: 4, completed: 1, failed: 1, cancelled: 1, running: 0, blocked: 2, unknown: 1 })
    expect(stats.needsYou).toBe(1)
    expect(stats.byLane.map((group) => group.work.total)).toEqual([3, 1])
    expect(stats.byStage[0].work).toEqual(stats.work)
    expect(stats.attempts.successRate).toBeNull()
  })

  it('deduplicates native executions and does not classify repeated attempts as technical retries', () => {
    const stats = projectPipelineStatistics(
      [node('analysis'), node('verification')],
      [
        { id: 'a', taskId: 'analysis', status: 'failed', agentExecutionId: 'native-1' },
        { id: 'b', taskId: 'analysis', status: 'succeeded', agentExecutionId: 'native-2' },
        { id: 'linked', taskId: 'verification', status: 'succeeded', agentExecutionId: 'native-2' },
        { id: 'c', taskId: 'analysis', status: 'queued', runtimeStatus: 'unknown' },
        { id: 'd', taskId: 'verification', status: 'cancelled' },
        { id: 'outside', taskId: 'another-instance', status: 'succeeded' }
      ]
    )
    expect(stats.attempts).toEqual({
      total: 4,
      queued: 0,
      running: 0,
      waiting: 0,
      succeeded: 1,
      failed: 1,
      cancelled: 1,
      unknown: 1,
      terminal: 3,
      successRate: 1 / 3,
      retries: 0,
      additionalAttempts: 2,
      unclassifiedAttempts: 4
    })
    expect(stats.work.completed).toBe(0)
    expect(stats.executionScope).toBe('linked_task_history')
  })
})

it('counts only explicitly classified technical retries, including an executor change', () => {
  const stats = projectPipelineStatistics(
    [node('analysis')],
    [
      { id: 'first', taskId: 'analysis', status: 'failed', xpertId: 'first-assistant', pipelineAttemptKind: 'initial' },
      {
        id: 'retry',
        taskId: 'analysis',
        status: 'succeeded',
        xpertId: 'second-assistant',
        pipelineAttemptKind: 'technical_retry'
      },
      { id: 'rerun', taskId: 'analysis', status: 'succeeded' }
    ]
  )
  expect(stats.attempts).toMatchObject({ retries: 1, additionalAttempts: 2, unclassifiedAttempts: 1 })
  expect(stats.byExecutor?.find((group) => group.xpertId === 'second-assistant')?.attempts.retries).toBe(1)
  expect(projectPipelineStatistics([node('analysis')], [], false, 'round').executionScope).toBe('round')
})

it('deduplicates measured runtime intervals and groups actual executors independently of business acceptance', () => {
  const stats = projectPipelineStatistics(
    [node('a', { state: { ...state, lifecycle: 'failed' } }), node('b')],
    [
      {
        id: 'one',
        taskId: 'a',
        status: 'failed',
        runtimeStatus: 'success',
        agentExecutionId: 'native',
        xpertId: 'actual-assistant',
        runtimeStartedAt: '2026-10-19T00:00:00Z',
        runtimeCompletedAt: '2026-10-19T00:00:03Z'
      },
      {
        id: 'linked',
        taskId: 'b',
        status: 'succeeded',
        runtimeStatus: 'success',
        agentExecutionId: 'native',
        xpertId: 'actual-assistant',
        runtimeStartedAt: '2026-10-19T00:00:00Z',
        runtimeCompletedAt: '2026-10-19T00:00:03Z'
      },
      { id: 'other-round', taskId: 'outside', status: 'succeeded', xpertId: 'another-assistant' }
    ]
  )
  expect(stats.work.failed).toBe(1)
  expect(stats.attempts).toMatchObject({ total: 1, succeeded: 1, failed: 0, successRate: 1 })
  expect(stats.timing).toMatchObject({ samples: 1, unavailable: 0, totalMs: 3000 })
  expect(stats.byExecutor).toHaveLength(1)
  expect(stats.byExecutor?.[0]).toMatchObject({
    xpertId: 'actual-assistant',
    attempts: { total: 1 },
    timing: { totalMs: 3000 }
  })
})

it('uses explicit round attempts instead of all history on a reused Task', () => {
  const stats = projectPipelineStatistics(
    [
      { ...node('shared'), executionIds: ['current'] },
      { ...node('other'), executionIds: [] }
    ],
    [
      { id: 'old', taskId: 'shared', status: 'succeeded' },
      { id: 'current', taskId: 'shared', status: 'running' },
      { id: 'other-old', taskId: 'other', status: 'succeeded' }
    ],
    false,
    'round'
  )
  expect(stats.attempts).toMatchObject({ total: 1, running: 1, succeeded: 0 })
  expect(stats.executionScope).toBe('round')
})
