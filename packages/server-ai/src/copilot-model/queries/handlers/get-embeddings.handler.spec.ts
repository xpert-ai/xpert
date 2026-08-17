import { AiModelTypeEnum } from '@xpert-ai/contracts'
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
})
