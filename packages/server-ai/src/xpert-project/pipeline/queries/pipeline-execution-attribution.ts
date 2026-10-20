import type { ProjectTaskGraph } from '@xpert-ai/contracts'

/** Task identity survives rounds. Only persisted dispatch ownership can place an execution on a node. */
export interface PipelineExecutionOwner {
    roundId: string
    nodeInstanceId: string
    operationId?: string
    agentExecutionId?: string
}
type Node = { id: string; taskIds: string[] }
export function attributePipelineExecutions<T extends Node>(
    nodes: readonly T[],
    roundId: string,
    executions: ProjectTaskGraph['executions'],
    owners: readonly PipelineExecutionOwner[]
) {
    const byOperation = new Map(owners.filter((owner) => owner.operationId).map((owner) => [owner.operationId, owner]))
    const byNative = new Map(
        owners.filter((owner) => owner.agentExecutionId).map((owner) => [owner.agentExecutionId, owner])
    )
    const byNode = new Map(nodes.map((node) => [node.id, node]))
    const ids = new Map(nodes.map((node) => [node.id, new Set<string>()]))
    const linkedTasks = new Set(nodes.flatMap((node) => node.taskIds))
    const unattributed = new Set<string>()
    for (const attempt of executions) {
        if (!linkedTasks.has(attempt.taskId)) continue
        const owner =
            (attempt.sourceKey && byOperation.get(attempt.sourceKey)) ||
            (attempt.agentExecutionId && byNative.get(attempt.agentExecutionId))
        if (!owner) {
            unattributed.add(
                attempt.agentExecutionId
                    ? `native:${attempt.agentExecutionId}`
                    : attempt.invocationId
                      ? `invocation:${attempt.invocationId}`
                      : attempt.id
            )
            continue
        }
        if (owner.roundId !== roundId) continue
        const node = byNode.get(owner.nodeInstanceId)
        if (node?.taskIds.includes(attempt.taskId)) ids.get(node.id)!.add(attempt.id)
    }
    return {
        nodes: nodes.map((node) => ({ ...node, executionIds: [...ids.get(node.id)!].sort() })),
        executionAttribution: { scope: 'node_round' as const, unattributedCount: unattributed.size }
    }
}
