import type { IModelInvocation, IXpertAgentExecution, ModelInvocationUsageSummary } from '@xpert-ai/contracts'
import { addModelInvocationUsageSummaries, emptyModelInvocationUsageSummary } from '../model-invocation'

export function collectExecutionIds(execution: IXpertAgentExecution): string[] {
    const ids = execution.id ? [execution.id] : []
    for (const child of execution.subExecutions ?? []) {
        ids.push(...collectExecutionIds(child))
    }
    return ids
}

export function attachModelInvocationUsage(
    execution: IXpertAgentExecution,
    directSummaries: Map<string, ModelInvocationUsageSummary>
): IXpertAgentExecution {
    const subExecutions = (execution.subExecutions ?? []).map((child) =>
        attachModelInvocationUsage(child, directSummaries)
    )
    let summary = execution.id
        ? (directSummaries.get(execution.id) ?? emptyModelInvocationUsageSummary())
        : emptyModelInvocationUsageSummary()

    for (const child of subExecutions) {
        summary = addModelInvocationUsageSummaries(summary, executionSummary(child))
    }

    return {
        ...execution,
        ...summary,
        subExecutions
    }
}

export function attachModelInvocationDetails(
    execution: IXpertAgentExecution,
    invocations: IModelInvocation[]
): IXpertAgentExecution {
    const children = (execution.subExecutions ?? []).map((child) => attachModelInvocationDetails(child, invocations))
    const directInvocations = execution.id
        ? invocations.filter((invocation) => invocation.originExecutionId === execution.id)
        : []
    return {
        ...execution,
        subExecutions: children,
        totalTokens:
            (execution.tokens ?? 0) +
            modelInvocationTokens(directInvocations) +
            children.reduce((total, child) => total + (child.totalTokens ?? 0), 0),
        modelInvocations: directInvocations
    }
}

function modelInvocationTokens(invocations: IModelInvocation[]): number {
    return invocations.reduce(
        (total, invocation) =>
            total +
            (invocation.metrics ?? []).reduce(
                (invocationTotal, metric) =>
                    invocationTotal + (metric.unit === 'token' ? (metric.totalTokens ?? 0) : 0),
                0
            ),
        0
    )
}

function executionSummary(execution: IXpertAgentExecution): ModelInvocationUsageSummary {
    return {
        videoPromptTokens: execution.videoPromptTokens ?? 0,
        videoCompletionTokens: execution.videoCompletionTokens ?? 0,
        videoTokens: execution.videoTokens ?? 0,
        videoGenerations: execution.videoGenerations ?? 0,
        generatedSeconds: execution.generatedSeconds ?? 0,
        pendingVideoInvocations: execution.pendingVideoInvocations ?? 0,
        unknownVideoUsage: execution.unknownVideoUsage ?? 0
    }
}
