import { attributePipelineExecutions, type PipelineExecutionOwner } from './pipeline-execution-attribution'
import type { ProjectTaskGraph } from '@xpert-ai/contracts'
const attempt = (
    id: string,
    patch: Partial<ProjectTaskGraph['executions'][number]> = {}
): ProjectTaskGraph['executions'][number] => ({ id, taskId: 'reused-task', attempt: 1, status: 'succeeded', ...patch })
const nodes = [
    { id: 'new-node', taskIds: ['reused-task'] },
    { id: 'sibling', taskIds: ['reused-task'] }
]
const owners: PipelineExecutionOwner[] = [
    { roundId: 'old-round', nodeInstanceId: 'old-node', agentExecutionId: 'old-native' },
    { roundId: 'new-round', nodeInstanceId: 'new-node', agentExecutionId: 'new-native' },
    { roundId: 'new-round', nodeInstanceId: 'new-node', operationId: 'retry-operation' }
]
const executions = [
    attempt('old', { agentExecutionId: 'old-native' }),
    attempt('new', { agentExecutionId: 'new-native' }),
    attempt('retry', { attempt: 2, sourceKey: 'retry-operation', invocationId: 'retry-invocation' })
]
it('uses exact node and round ownership despite a reused logical Task or shared task links', () => {
    const result = attributePipelineExecutions(nodes, 'new-round', executions, owners)
    expect(result.nodes.map((node) => node.executionIds)).toEqual([['new', 'retry'], []])
    expect(result.executionAttribution).toEqual({ scope: 'node_round', unattributedCount: 0 })
})
it('recovers older dispatch ownership from current runtime observations without importing later executions', () => {
    const result = attributePipelineExecutions(
        [{ id: 'old-node', taskIds: ['reused-task'] }],
        'old-round',
        executions,
        owners
    )
    expect(result.nodes[0].executionIds).toEqual(['old'])
})
it('fails closed for legacy executions and never uses times, ordinals or assignee to guess ownership', () => {
    const result = attributePipelineExecutions(
        nodes,
        'new-round',
        [
            attempt('legacy', { agentExecutionId: 'unknown' }),
            attempt('duplicate', { agentExecutionId: 'unknown' }),
            attempt('outside', { taskId: 'unrelated-task' })
        ],
        owners
    )
    expect(result.nodes.every((node) => !node.executionIds.length)).toBe(true)
    expect(result.executionAttribution.unattributedCount).toBe(1)
})
it('does not accept a valid dispatch joined to an unrelated Task or node', () => {
    const result = attributePipelineExecutions(
        [{ id: 'new-node', taskIds: ['another-task'] }],
        'new-round',
        executions,
        owners
    )
    expect(result.nodes[0].executionIds).toEqual([])
    const siblingOnly = attributePipelineExecutions([nodes[1]], 'new-round', executions, owners)
    expect(siblingOnly.nodes[0].executionIds).toEqual([])
})
it('keeps service attempts using their operation identity even with no native or invocation id', () => {
    const result = attributePipelineExecutions(
        nodes,
        'new-round',
        [attempt('service', { sourceKey: 'retry-operation' })],
        owners
    )
    expect(result.nodes[0].executionIds).toEqual(['service'])
})
