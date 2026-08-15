import type { IModelUsageDetails, IXpertAgentExecution, ModelUsageSummary } from '@xpert-ai/contracts'
import { addModelUsageSummaries, emptyModelUsageSummary } from '../model-usage'

export function collectExecutionIds(execution: IXpertAgentExecution): string[] {
    const ids = execution.id ? [execution.id] : []
    for (const child of execution.subExecutions ?? []) {
        ids.push(...collectExecutionIds(child))
    }
    return ids
}

export function attachModelUsageSummary(
    execution: IXpertAgentExecution,
    directSummaries: Map<string, ModelUsageSummary>
): IXpertAgentExecution {
    const subExecutions = (execution.subExecutions ?? []).map((child) =>
        attachModelUsageSummary(child, directSummaries)
    )
    let summary = execution.id
        ? (directSummaries.get(execution.id) ?? emptyModelUsageSummary())
        : emptyModelUsageSummary()

    for (const child of subExecutions) {
        summary = addModelUsageSummaries(summary, executionSummary(child))
    }

    return { ...execution, ...summary, subExecutions }
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

function executionSummary(execution: IXpertAgentExecution): ModelUsageSummary {
    return {
        videoPromptTokens: execution.videoPromptTokens ?? 0,
        videoCompletionTokens: execution.videoCompletionTokens ?? 0,
        videoTokens: execution.videoTokens ?? 0,
        videoGenerations: execution.videoGenerations ?? 0,
        generatedSeconds: execution.generatedSeconds ?? 0
    }
}
