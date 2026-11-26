import type { ProjectPipelineOperationReceipt } from '@xpert-ai/contracts'
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

/** An explicit wait receipt is authoritative over a service Task's generic running observation. */
export function observeOperationWaits(
    nodes: Node[],
    operations: Array<{
        nodeInstanceId: string
        attempt: number
        state: string
        receipt: ProjectPipelineOperationReceipt | null
    }>
): Node[] {
    const latest = new Map<string, (typeof operations)[number]>()
    for (const operation of operations) {
        const previous = latest.get(operation.nodeInstanceId)
        if (!previous || operation.attempt > previous.attempt) latest.set(operation.nodeInstanceId, operation)
    }
    return nodes.map((node) => {
        const operation = latest.get(node.id)
        if (
            node.projection.state.lifecycle !== 'active' ||
            operation?.state !== 'pending' ||
            operation.receipt?.status !== 'pending' ||
            !operation.receipt.code
        )
            return node
        return {
            ...node,
            projection: {
                ...node.projection,
                state: {
                    ...node.projection.state,
                    readiness: 'blocked',
                    runtime: 'waiting'
                }
            }
        }
    })
}
