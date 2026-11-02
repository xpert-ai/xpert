import { AiModelTypeEnum, ModelUsageReport } from '@xpert-ai/contracts'
import { CopilotModelGetChatModelQuery } from '../get-chat-model.query'
import { CopilotModelGetEmbeddingsQuery } from '../get-embeddings.query'
import { CopilotModelGetEmbeddingsHandler } from './get-embeddings.handler'

describe('CopilotModelGetEmbeddingsHandler', () => {
    it('forwards the unified usage reporter to the embedding model instance', async () => {
        const embeddings = { embedQuery: jest.fn(), embedDocuments: jest.fn() }
        let nestedQuery: CopilotModelGetChatModelQuery | undefined
        const queryBus = {
            execute: jest.fn(async (query) => {
                nestedQuery = query
                return embeddings
            })
        }
        const handler = new CopilotModelGetEmbeddingsHandler(
            { execute: jest.fn() } as never,
            queryBus as never,
            { t: jest.fn() } as never
        )
        const modelUsageCallback = jest.fn()

        await expect(
            handler.execute(
                new CopilotModelGetEmbeddingsQuery(
                    { id: 'copilot-1' } as never,
                    {
                        copilotId: 'copilot-1',
                        model: 'text-embedding-v3',
                        modelType: AiModelTypeEnum.TEXT_EMBEDDING
                    } as never,
                    { modelUsageCallback }
                )
            )
        ).resolves.toBe(embeddings)

        expect(nestedQuery).toBeInstanceOf(CopilotModelGetChatModelQuery)
        expect(nestedQuery?.options.modelUsageCallback).toBe(modelUsageCallback)
    })
    it('derives the legacy token callback from the same authoritative model event', async () => {
        let query: CopilotModelGetChatModelQuery | undefined
        const handler = new CopilotModelGetEmbeddingsHandler(
            { execute: jest.fn() } as never,
            {
                execute: jest.fn(async (value) => {
                    query = value
                    return {}
                })
            } as never,
            { t: jest.fn() } as never
        )
        const tokenCallback = jest.fn()
        const modelUsageCallback = jest.fn()
        await handler.execute(
            new CopilotModelGetEmbeddingsQuery(
                { id: 'copilot' } as never,
                { model: 'embedding', modelType: AiModelTypeEnum.TEXT_EMBEDDING } as never,
                { tokenCallback, modelUsageCallback }
            )
        )
        const report: ModelUsageReport = {
            requestId: 'request',
            modelType: AiModelTypeEnum.TEXT_EMBEDDING,
            operation: AiModelTypeEnum.TEXT_EMBEDDING,
            modality: 'text',
            recordedAt: new Date().toISOString(),
            metrics: [{ unit: 'token', authority: 'provider', promptTokens: 7, totalTokens: 7 }]
        }
        await query?.options.modelUsageCallback?.(report)
        expect(modelUsageCallback).toHaveBeenCalledWith(report)
        expect(modelUsageCallback).toHaveBeenCalledTimes(1)
        expect(tokenCallback).toHaveBeenCalledWith(7)
        expect(tokenCallback).toHaveBeenCalledTimes(1)
        await query?.options.modelUsageCallback?.({ ...report, metrics: [] })
        expect(tokenCallback).toHaveBeenCalledTimes(1)
        await query?.options.usageCallback?.({
            promptTokens: 3,
            completionTokens: 0,
            totalTokens: 3,
            promptUnitPrice: 0,
            promptPriceUnit: 1,
            promptPrice: 0,
            completionUnitPrice: 0,
            completionPriceUnit: 1,
            completionPrice: 0,
            totalPrice: 0,
            currency: 'CNY',
            latency: 0
        })
        expect(tokenCallback).toHaveBeenLastCalledWith(3)
    })
})
