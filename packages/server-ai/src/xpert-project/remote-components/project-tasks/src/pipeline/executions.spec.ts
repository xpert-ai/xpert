import { pipelineExecutions } from './executions'
import type { Attempt } from '../model'
const attempt = (id: string, patch: Partial<Attempt> = {}): Attempt => ({
    id,
    taskId: 'reused-task',
    attempt: 1,
    status: 'succeeded',
    ...patch
})
const nodes = [
    { taskIds: ['reused-task'], executionIds: ['new', 'retry'] },
    { taskIds: ['second-task'], executionIds: ['alias'] }
]
const graph = {
    nodes,
    tasks: {
        executions: [
            attempt('old', { agentExecutionId: 'old-native' }),
            attempt('new', { agentExecutionId: 'new-native' }),
            attempt('retry', { attempt: 2, agentExecutionId: 'retry-native' }),
            attempt('alias', { taskId: 'second-task', agentExecutionId: 'new-native' })
        ]
    }
}
it('shows only this node and round, retaining distinct retries', () => {
    expect(pipelineExecutions(graph, [nodes[0]]).map((item) => item.id)).toEqual(['new', 'retry'])
    expect(pipelineExecutions(graph, [nodes[1]]).map((item) => item.id)).toEqual(['alias'])
})
it('deduplicates lane execution identities across Tasks and nodes deterministically', () => {
    expect(pipelineExecutions(graph)).toHaveLength(2)
    expect(pipelineExecutions({ ...graph, tasks: { executions: [...graph.tasks.executions].reverse() } })).toEqual(
        pipelineExecutions(graph)
    )
})
it('does not fall back to logical Task history when attribution is missing or empty', () => {
    for (const node of [{ taskIds: ['reused-task'] }, { taskIds: ['reused-task'], executionIds: [] }]) {
        expect(pipelineExecutions(graph, [node])).toEqual([])
    }
})
it('checks Task membership as well as the exact execution ID', () => {
    expect(pipelineExecutions(graph, [{ taskIds: ['other-task'], executionIds: ['new'] }])).toEqual([])
})
it('deduplicates invocations but does not merge distinct service attempts with the same ordinal', () => {
    const executions = [
        attempt('a', { invocationId: 'invocation' }),
        attempt('b', { invocationId: 'invocation' }),
        attempt('c'),
        attempt('d')
    ]
    expect(
        pipelineExecutions({
            nodes: [{ taskIds: ['reused-task'], executionIds: ['a', 'b', 'c', 'd'] }],
            tasks: { executions }
        }).map((item) => item.id)
    ).toEqual(['a', 'c', 'd'])
})
