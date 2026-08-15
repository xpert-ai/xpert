import type { IModelUsageDetails, IXpertAgentExecution } from '@xpert-ai/contracts'

export function collectExecutionIds(execution: IXpertAgentExecution): string[] {
    const ids = execution.id ? [execution.id] : []
    for (const child of execution.subExecutions ?? []) {
        ids.push(...collectExecutionIds(child))
    }
    return ids
}

export function attachModelUsageDetails(
    execution: IXpertAgentExecution,
    usages: IModelUsageDetails[]
): IXpertAgentExecution {
    const children = (execution.subExecutions ?? []).map((child) => attachModelUsageDetails(child, usages))
    const directUsages = execution.id ? usages.filter((usage) => usage.originExecutionId === execution.id) : []
    return {
        ...execution,
        subExecutions: children,
        totalTokens:
            (execution.tokens ?? 0) +
            modelUsageTokens(directUsages) +
            children.reduce((total, child) => total + (child.totalTokens ?? 0), 0),
        modelUsages: directUsages
    }
}

function modelUsageTokens(usages: IModelUsageDetails[]): number {
    return usages.reduce(
        (total, usage) =>
            total +
            usage.metrics.reduce(
                (usageTotal, metric) => usageTotal + (metric.unit === 'token' ? (metric.totalTokens ?? 0) : 0),
                0
            ),
        0
    )
}
