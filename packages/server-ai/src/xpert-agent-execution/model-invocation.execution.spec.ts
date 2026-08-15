import type {
    AiModelTypeEnum,
    IModelInvocation,
    IXpertAgentExecution,
    ModelInvocationUsageSummary
} from '@xpert-ai/contracts'
import { attachModelInvocationDetails, attachModelInvocationUsage } from './model-invocation.execution'

describe('attachModelInvocationUsage', () => {
    it('aggregates direct invocation usage through the execution tree without changing token totals', () => {
        const execution: IXpertAgentExecution = {
            id: 'root',
            tokens: 23,
            subExecutions: [{ id: 'child', tokens: 11 }]
        }
        const summaries = new Map<string, ModelInvocationUsageSummary>([
            ['root', summary({ videoGenerations: 1 })],
            ['child', summary({ generatedSeconds: 8, pendingVideoInvocations: 1 })]
        ])

        const result = attachModelInvocationUsage(execution, summaries)

        expect(result).toEqual(
            expect.objectContaining({
                tokens: 23,
                videoGenerations: 1,
                generatedSeconds: 8,
                pendingVideoInvocations: 1
            })
        )
        expect(result.subExecutions?.[0]).toEqual(
            expect.objectContaining({
                tokens: 11,
                videoGenerations: 0,
                generatedSeconds: 8,
                pendingVideoInvocations: 1
            })
        )
    })

    it('adds direct model invocation tokens to the execution tree total and keeps details on their execution', () => {
        const execution: IXpertAgentExecution = {
            id: 'root',
            tokens: 23,
            subExecutions: [{ id: 'child', tokens: 11 }]
        }
        const invocations = [
            invocation({
                id: 'root-invocation',
                originExecutionId: 'root',
                invocationKey: 'root-tool-call',
                metrics: [
                    {
                        unit: 'token',
                        promptTokens: 0,
                        completionTokens: 16_384,
                        totalTokens: 16_384,
                        authority: 'provider'
                    },
                    { unit: 'generation', quantity: 1, authority: 'provider' }
                ]
            }),
            invocation({
                id: 'child-invocation',
                originExecutionId: 'child',
                invocationKey: 'child-tool-call',
                metrics: [{ unit: 'token', totalTokens: 100, authority: 'provider' }]
            })
        ]

        const result = attachModelInvocationDetails(execution, invocations)

        expect(result.totalTokens).toBe(16_518)
        expect(result.modelInvocations?.map(({ id }) => id)).toEqual(['root-invocation'])
        expect(result.subExecutions?.[0].totalTokens).toBe(111)
        expect(result.subExecutions?.[0].modelInvocations?.map(({ id }) => id)).toEqual(['child-invocation'])
    })
})

function summary(overrides: Partial<ModelInvocationUsageSummary>): ModelInvocationUsageSummary {
    return {
        videoPromptTokens: 0,
        videoCompletionTokens: 0,
        videoTokens: 0,
        videoGenerations: 0,
        generatedSeconds: 0,
        pendingVideoInvocations: 0,
        unknownVideoUsage: 0,
        ...overrides
    }
}

function invocation(overrides: Partial<IModelInvocation>): IModelInvocation {
    return {
        id: 'invocation-1',
        tenantId: 'tenant-1',
        organizationId: 'organization-1',
        invocationKey: 'tool-call-1',
        originType: 'execution',
        originId: 'root',
        originExecutionId: 'root',
        userId: 'user-1',
        agentKey: 'agent-1',
        toolsetId: 'toolset-1',
        providerScopeId: 'provider-scope-1',
        copilotId: 'copilot-1',
        provider: 'seedream_aigc',
        modelType: 'image' as AiModelTypeEnum.IMAGE,
        model: 'doubao-seedream-4-5-251128',
        toolName: 'seedream_text_to_image',
        operation: 'text_to_image',
        modality: 'image',
        providerState: 'succeeded',
        usageAvailability: 'available',
        metrics: [],
        artifactState: 'ready',
        reconciliationState: 'finished',
        reconcileAttempts: 0,
        startedAt: new Date('2026-08-15T00:00:00.000Z'),
        ...overrides
    }
}
