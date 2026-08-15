import type { AiModelTypeEnum, IModelUsageDetails, IXpertAgentExecution, ModelUsageSummary } from '@xpert-ai/contracts'
import { attachModelUsageDetails, attachModelUsageSummary } from './model-usage.execution'

describe('model usage execution projection', () => {
    it('aggregates direct usage through the execution tree', () => {
        const execution: IXpertAgentExecution = {
            id: 'root',
            tokens: 23,
            subExecutions: [{ id: 'child', tokens: 11 }]
        }
        const summaries = new Map<string, ModelUsageSummary>([
            ['root', summary({ videoGenerations: 1 })],
            ['child', summary({ generatedSeconds: 8 })]
        ])

        const result = attachModelUsageSummary(execution, summaries)

        expect(result).toEqual(expect.objectContaining({ tokens: 23, videoGenerations: 1, generatedSeconds: 8 }))
        expect(result.subExecutions?.[0]).toEqual(
            expect.objectContaining({ tokens: 11, videoGenerations: 0, generatedSeconds: 8 })
        )
    })

    it('adds ledger token usage to total tokens and keeps details on their execution', () => {
        const execution: IXpertAgentExecution = {
            id: 'root',
            tokens: 23,
            subExecutions: [{ id: 'child', tokens: 11 }]
        }
        const usages = [
            usage({
                requestId: 'root-tool-call',
                originExecutionId: 'root',
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
            usage({
                requestId: 'child-tool-call',
                originExecutionId: 'child',
                metrics: [{ unit: 'token', totalTokens: 100, authority: 'provider' }]
            })
        ]

        const result = attachModelUsageDetails(execution, usages)

        expect(result.totalTokens).toBe(16_518)
        expect(result.modelUsages?.map(({ requestId }) => requestId)).toEqual(['root-tool-call'])
        expect(result.subExecutions?.[0].totalTokens).toBe(111)
        expect(result.subExecutions?.[0].modelUsages?.map(({ requestId }) => requestId)).toEqual(['child-tool-call'])
    })
})

function summary(overrides: Partial<ModelUsageSummary>): ModelUsageSummary {
    return {
        videoPromptTokens: 0,
        videoCompletionTokens: 0,
        videoTokens: 0,
        videoGenerations: 0,
        generatedSeconds: 0,
        ...overrides
    }
}

function usage(overrides: Partial<IModelUsageDetails>): IModelUsageDetails {
    return {
        requestId: 'tool-call-1',
        providerScopeId: 'provider-scope-1',
        originExecutionId: 'root',
        provider: 'seedream_aigc',
        modelType: 'image' as AiModelTypeEnum.IMAGE,
        model: 'doubao-seedream-4-5-251128',
        toolName: 'seedream_text_to_image',
        operation: 'text_to_image',
        modality: 'image',
        metrics: [],
        recordedAt: new Date('2026-08-15T00:00:00.000Z'),
        ...overrides
    }
}
