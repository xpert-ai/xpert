import type { AiModelTypeEnum, IModelUsageDetails, IXpertAgentExecution } from '@xpert-ai/contracts'
import { attachModelUsageDetails } from './model-usage.execution'

describe('model usage execution projection', () => {
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
