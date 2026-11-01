import { RagCreateVStoreCommand } from '../../rag-vstore/commands/create.command'

import { VectorTypeEnum } from '@xpert-ai/contracts'

import { AiModelTypeEnum } from '@xpert-ai/contracts'

import { Knowledgebase } from '../persistence/knowledgebase.entity'

import { CopilotModelGetEmbeddingsQuery, CopilotModelGetRerankQuery } from '../../copilot-model'

import {
    KnowledgebaseRepositoryMock,
    CommandBusMock,
    QueryBusMock,
    runInRequestContext,
    createService
} from '../testing/knowledgebase-service.fixture'

describe('Knowledgebase embedding', () => {
    beforeEach(() => jest.clearAllMocks())
    afterEach(() => jest.restoreAllMocks())
    it('passes Xpert billing context to embedding and rerank models', async () => {
        const modelProvider = {
            id: 'provider-1',
            providerName: 'openai-compatible'
        }
        const embeddingCopilot = {
            id: 'embedding-copilot-1',
            enabled: true,
            modelProvider
        }
        const rerankCopilot = {
            id: 'rerank-copilot-1',
            enabled: true,
            modelProvider
        }
        const knowledgebase = {
            vectorStore: VectorTypeEnum.MILVUS,
            id: 'kb-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            embeddingCollectionName: 'kb-1',
            copilotModelId: 'embedding-model-1',
            copilotModel: {
                id: 'embedding-model-1',
                modelType: AiModelTypeEnum.TEXT_EMBEDDING,
                model: 'text-embedding-v4',
                copilotId: embeddingCopilot.id,
                copilot: embeddingCopilot
            },
            rerankModelId: 'rerank-model-1',
            rerankModel: {
                id: 'rerank-model-1',
                modelType: AiModelTypeEnum.RERANK,
                model: 'qwen3-rerank',
                copilotId: rerankCopilot.id,
                copilot: rerankCopilot
            }
        } as unknown as Knowledgebase
        const repository: jest.Mocked<KnowledgebaseRepositoryMock> = {
            findOne: jest.fn(),
            delete: jest.fn()
        }
        const commandBus: jest.Mocked<CommandBusMock> = {
            execute: jest.fn().mockResolvedValue({})
        }
        const queryBus: jest.Mocked<QueryBusMock> = {
            execute: jest.fn().mockResolvedValue({})
        }
        const service = createService({
            repository,
            commandBus,
            queryBus,
            xpertService: { updateXpert: jest.fn() }
        })

        await runInRequestContext(() =>
            service.getActiveVectorStore(knowledgebase, true, {
                xpertId: 'xpert-1',
                threadId: 'thread-1'
            })
        )
        await runInRequestContext(() =>
            service.getGraphEntityVectorStore(knowledgebase, true, {
                xpertId: 'xpert-1',
                threadId: 'thread-1'
            })
        )

        expect(
            commandBus.execute.mock.calls.every(
                ([command]) =>
                    command instanceof RagCreateVStoreCommand && command.config.vectorStore === VectorTypeEnum.MILVUS
            )
        ).toBe(true)

        const embeddingQueries = queryBus.execute.mock.calls
            .map(([query]) => query)
            .filter((query): query is CopilotModelGetEmbeddingsQuery => query instanceof CopilotModelGetEmbeddingsQuery)
        const rerankQuery = queryBus.execute.mock.calls
            .map(([query]) => query)
            .find((query): query is CopilotModelGetRerankQuery => query instanceof CopilotModelGetRerankQuery)
        expect(embeddingQueries).toHaveLength(2)
        expect(embeddingQueries.map(({ options }) => options)).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ xpertId: 'xpert-1', threadId: 'thread-1' }),
                expect.objectContaining({ xpertId: 'xpert-1', threadId: 'thread-1' })
            ])
        )
        expect(rerankQuery?.options).toEqual(expect.objectContaining({ xpertId: 'xpert-1', threadId: 'thread-1' }))
    })
})
