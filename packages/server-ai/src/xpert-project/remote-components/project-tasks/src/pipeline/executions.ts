import type { PipelineGraph, PipelineNode } from './bridge'
import type { Attempt } from '../model'

/** Scope first, then deduplicate. The chosen attempt ID is also the authorized navigation target. */
export function pipelineExecutions(
    graph: {
        tasks: Pick<PipelineGraph['tasks'], 'executions'>
        nodes: Array<Pick<PipelineNode, 'taskIds' | 'executionIds'>>
    },
    nodes: ReadonlyArray<Pick<PipelineNode, 'taskIds' | 'executionIds'>> = graph.nodes
): Attempt[] {
    const owners = new Map<string, Set<string>>()
    for (const node of nodes)
        for (const id of node.executionIds ?? []) {
            const tasks = owners.get(id) ?? new Set<string>()
            node.taskIds.forEach((taskId) => tasks.add(taskId))
            owners.set(id, tasks)
        }
    const unique = new Map<string, Attempt>()
    for (const attempt of [...graph.tasks.executions].sort(
        (a, b) => a.attempt - b.attempt || a.id.localeCompare(b.id)
    )) {
        if (!owners.get(attempt.id)?.has(attempt.taskId)) continue
        const identity = attempt.agentExecutionId
            ? `native:${attempt.agentExecutionId}`
            : attempt.invocationId
              ? `invocation:${attempt.invocationId}`
              : `attempt:${attempt.id}`
        if (!unique.has(identity)) unique.set(identity, attempt)
    }
    return [...unique.values()]
}
