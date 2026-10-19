import {
  pipelineAttemptCounts,
  pipelineExecutionTiming,
  pipelineExecutorStatistics,
  type PipelineAttemptFact
} from './execution-statistics'

const fact = (patch: Partial<PipelineAttemptFact> = {}): PipelineAttemptFact => ({
  id: 'attempt',
  taskId: 'work',
  status: 'succeeded',
  ...patch
})
describe('runtime outcome and measured execution statistics', () => {
  it('does not turn business rejection into runtime failure or interrupted execution into cancellation', () => {
    expect(
      pipelineAttemptCounts([
        fact({ status: 'failed', runtimeStatus: 'success' }),
        fact({ runtimeStatus: 'interrupted' }),
        fact({ runtimeStatus: 'unknown' }),
        fact({ runtimeStatus: 'timeout' }),
        fact({ runtimeStatus: 'pending' })
      ])
    ).toMatchObject({
      total: 5,
      succeeded: 1,
      failed: 1,
      waiting: 1,
      unknown: 1,
      queued: 1,
      cancelled: 0,
      terminal: 2,
      successRate: 0.5
    })
  })
  it('keeps missing, malformed, reversed and nonterminal intervals out of duration totals', () => {
    const timed = (seconds: number) =>
      fact({
        runtimeStartedAt: '2026-10-19T00:00:00Z',
        runtimeCompletedAt: `2026-10-19T00:00:${seconds.toString().padStart(2, '0')}Z`
      })
    expect(
      pipelineExecutionTiming([
        timed(1),
        timed(3),
        timed(9),
        fact(),
        fact({ runtimeStartedAt: 'invalid' }),
        fact({ runtimeStartedAt: '2026-10-19T00:01:00Z', runtimeCompletedAt: '2026-10-19T00:00:00Z' }),
        { ...timed(4), runtimeStatus: 'running' }
      ])
    ).toEqual({ samples: 3, unavailable: 4, totalMs: 13000, meanMs: 13000 / 3, medianMs: 3000, p95Ms: 9000 })
    expect(pipelineExecutionTiming([fact()])).toMatchObject({
      samples: 0,
      unavailable: 1,
      totalMs: null,
      meanMs: null,
      medianMs: null,
      p95Ms: null
    })
    expect(pipelineExecutionTiming([timed(0)])).toMatchObject({ samples: 1, unavailable: 0, totalMs: 0 })
  })
  it('groups exact actual executor metadata and keeps absent identity explicit', () => {
    const groups = pipelineExecutorStatistics([
      fact({ xpertId: 'assistant-a', agentKey: 'primary', runtimeProvider: 'native' }),
      fact({ xpertId: 'assistant-b', agentKey: 'primary', runtimeProvider: 'native' }),
      fact({ xpertId: 'assistant-a', agentKey: 'primary', runtimeProvider: 'native' }),
      fact({ runtimeProvider: 'external', runtimeToolId: 'review-tool' }),
      fact()
    ])
    expect(groups.map((group) => [group.xpertId, group.attempts.total])).toEqual([
      ['assistant-a', 2],
      ['assistant-b', 1],
      [null, 1],
      [null, 1]
    ])
    expect(groups[3]).toMatchObject({ xpertId: null, agentKey: null, provider: null, toolId: null })
  })
  it('distinguishes registered service handlers without treating them as unknown assistants', () => {
    expect(
      pipelineExecutorStatistics([
        fact({ runtimeProvider: 'pipeline-service', runtimeServiceRef: 'prepare@1' }),
        fact({ runtimeProvider: 'pipeline-service', runtimeServiceRef: 'archive@1' })
      ]).map((group) => [group.serviceRef, group.attempts.total])
    ).toEqual([
      ['prepare@1', 1],
      ['archive@1', 1]
    ])
  })
})
