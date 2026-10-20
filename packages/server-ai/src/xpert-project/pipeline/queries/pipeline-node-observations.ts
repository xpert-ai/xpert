import { pipelineAttemptCounts, type ProjectPipelineGraph, type ProjectTaskGraph } from '@xpert-ai/contracts'

type Node = ProjectPipelineGraph['nodes'][number]
type Attempt = ProjectTaskGraph['executions'][number]

/** Read-time runtime observations only. Never persist these over a historical business snapshot. */
export function observePipelineNodes(nodes: Node[], executions: Attempt[]): Node[] {
    const attempts = new Map(executions.map((attempt) => [attempt.id, attempt]))
    return nodes.map((node) => {
        const latest = new Map<string, Attempt[]>()
        for (const id of node.executionIds ?? []) {
            const attempt = attempts.get(id)
            if (!attempt || !node.taskIds.includes(attempt.taskId)) continue
            const previous = latest.get(attempt.taskId)
            if (!previous || attempt.attempt > previous[0].attempt) latest.set(attempt.taskId, [attempt])
            else if (attempt.attempt === previous[0].attempt) previous.push(attempt)
        }
        // Partial coverage cannot establish the runtime state of the whole node.
        if (!latest.size || node.taskIds.some((id) => !latest.has(id))) return node
        const counts = pipelineAttemptCounts([...latest.values()].flat())
        const runtime =
            (['running', 'waiting', 'queued', 'unknown', 'failed', 'cancelled', 'succeeded'] as const).find(
                (status) => counts[status] > 0
            ) ?? 'unknown'
        return { ...node, projection: { ...node.projection, state: { ...node.projection.state, runtime } } }
    })
}
