import { providerHistoryTasks, observeHistoricalPipelineTasks } from './pipeline-history'
import { pipelineAttemptCounts, pipelineExecutionTiming } from '@xpert-ai/contracts'

it('keeps historical business acceptance without inventing native runtime status or duration', () => {
    const graph = providerHistoryTasks('project', 'instance', 'neutral.history@1', 'cursor', [
        {
            key: 'assess',
            title: 'Assessment',
            status: 'done',
            kind: 'task',
            predecessorKeys: [],
            executions: [
                {
                    key: 'attempt-1',
                    attempt: 1,
                    status: 'succeeded',
                    startedAt: '2026-10-19T00:00:00Z',
                    completedAt: '2026-10-19T00:05:00Z'
                }
            ]
        }
    ])
    expect(graph.executions[0]).toMatchObject({
        status: 'succeeded',
        runtimeStatus: 'unknown',
        startedAt: new Date('2026-10-19T00:00:00Z'),
        runtimeStartedAt: null,
        runtimeCompletedAt: null
    })
    expect(pipelineAttemptCounts(graph.executions)).toMatchObject({ succeeded: 0, unknown: 1, successRate: null })
    expect(pipelineExecutionTiming(graph.executions)).toMatchObject({ samples: 0, unavailable: 1, totalMs: null })
})

it('preserves historical business fields but refreshes execution observations and the polling cursor', () => {
    const history = providerHistoryTasks('project', 'instance', 'neutral.history@1', 'snapshot', [
        {
            key: 'assess',
            title: 'Original task',
            status: 'todo',
            kind: 'task',
            predecessorKeys: [],
            executions: [
                {
                    key: 'attempt-1',
                    attempt: 1,
                    status: 'running'
                }
            ]
        }
    ])
    const observed = {
        ...history,
        cursor: 'new-runtime-observation',
        tasks: history.tasks.map((task) => ({ ...task, title: 'Renamed task' })),
        executions: [
            {
                ...history.executions[0],
                runtimeStatus: 'succeeded' as const,
                runtimeCompletedAt: '2026-10-19T00:05:00Z'
            },
            { ...history.executions[0], id: 'unrelated', taskId: 'another-task' }
        ]
    }
    const result = observeHistoricalPipelineTasks(history, observed)
    expect(result.tasks[0].title).toBe('Original task')
    expect(result.executions).toHaveLength(1)
    expect(result.executions[0]).toMatchObject({
        runtimeStatus: 'succeeded',
        runtimeCompletedAt: '2026-10-19T00:05:00Z'
    })
    expect(result.cursor).toBe('snapshot:new-runtime-observation')
    expect(history.executions[0].runtimeStatus).toBe('unknown')
})
