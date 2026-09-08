import { ForbiddenException } from '@nestjs/common'
import { AiModelTypeEnum, KnowledgebaseTypeEnum, LanguagesEnum, RolesEnum, VectorTypeEnum } from '@xpert-ai/contracts'
import { environment } from '@xpert-ai/server-config'
import { IntegrationService, runWithRequestContext } from '@xpert-ai/server-core'
import type { Queue } from 'bull'
import { DataSource, Repository } from 'typeorm'
import { CopilotModelGetEmbeddingsQuery, CopilotModelGetRerankQuery } from '../copilot-model'
import { CopilotGetOneQuery } from '../copilot/queries'
import { KnowledgeDocumentChunkService } from '../knowledge-document/chunk/chunk.service'
import { XpertWorkspaceAccessService } from '../xpert-workspace'
import { prepareKnowledgeFilter } from './filter'
import { Knowledgebase } from './knowledgebase.entity'
import { KnowledgebaseService } from './knowledgebase.service'
import { VectorKnowledgeCandidateRetriever } from './retrieval'
import { KnowledgebaseTaskService } from './task'
import type { TKnowledgebaseRebuildEmbeddingJob } from './types'

function inRequestContext<T>(callback: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        runWithRequestContext(
            {
                headers: { 'organization-id': 'org-1' },
                user: {
                    id: 'user-1',
                    tenantId: 'tenant-1',
                    preferredLanguage: LanguagesEnum.English,
                    role: { name: RolesEnum.ADMIN }
                }
            },
            () => {
                callback().then(resolve).catch(reject)
            }
        )
    })
}

function setup(options: { embeddingsAvailable?: boolean; rerankAvailable?: boolean } = {}) {
    const copilot = { id: 'copilot-1', modelProvider: { id: 'provider-1', providerName: 'test-provider' } }
    const knowledgebase = Object.assign(new Knowledgebase(), {
        id: 'kb-1',
        name: 'Knowledgebase',
        type: KnowledgebaseTypeEnum.Standard,
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        createdById: 'user-1',
        embeddingCollectionName: 'kb-1',
        metadataSchema: [],
        copilotModel: {
            id: 'embedding-1',
            model: 'embedding-model',
            modelType: AiModelTypeEnum.TEXT_EMBEDDING,
            copilot
        },
        rerankModelId: 'rerank-1',
        rerankModel: { id: 'rerank-1', model: 'rerank-model', modelType: AiModelTypeEnum.RERANK, copilot }
    })
    const rerankModel = { rerank: jest.fn(async () => []) }
    const query = jest.fn(async (input: unknown) => {
        if (input instanceof CopilotGetOneQuery) return copilot
        if (input instanceof CopilotModelGetRerankQuery) {
            if (options.rerankAvailable === false) throw new Error('rerank provider unavailable')
            return rerankModel
        }
        if (input instanceof CopilotModelGetEmbeddingsQuery) {
            if (!options.embeddingsAvailable) throw new Error('embedding provider unavailable')
            return {}
        }
        throw new Error('Unexpected model query')
    })
    const repository = { findOne: jest.fn(async () => knowledgebase) }
    const workspaceAccess = { assertCan: jest.fn() }
    const command = jest.fn(async () => ({ structuredSimilaritySearchWithScore: async () => ({ items: [] }) }))
    const service = new KnowledgebaseService(
        repository as unknown as Repository<Knowledgebase>,
        workspaceAccess as unknown as XpertWorkspaceAccessService,
        Object.create(IntegrationService.prototype) as IntegrationService,
        Object.create(KnowledgebaseTaskService.prototype) as KnowledgebaseTaskService,
        Object.create(DataSource.prototype) as DataSource,
        {} as Queue<TKnowledgebaseRebuildEmbeddingJob>
    )
    Object.defineProperty(service, 'queryBus', { value: { execute: query } })
    Object.defineProperty(service, 'commandBus', { value: { execute: command } })
    return { service, knowledgebase, repository, workspaceAccess, query, command, rerankModel }
}

describe('Knowledgebase rerank model access', () => {
    it('loads only the rerank model through the scoped read boundary and preserves model context', async () => {
        const { service, repository, workspaceAccess, query, command, rerankModel } = setup()
        const result = await inRequestContext(() =>
            service.getRerankModel('kb-1', { xpertId: 'xpert-1', threadId: 'thread-1' })
        )
        expect(result).toBe(rerankModel)
        expect(workspaceAccess.assertCan).toHaveBeenCalledWith('workspace-1', 'read')
        expect(repository.findOne).toHaveBeenCalledWith(
            expect.objectContaining({
                relations: ['rerankModel', 'rerankModel.copilot', 'rerankModel.copilot.modelProvider']
            })
        )
        expect(query).toHaveBeenCalledTimes(1)
        expect(query).toHaveBeenCalledWith(
            expect.objectContaining({ options: expect.objectContaining({ xpertId: 'xpert-1', threadId: 'thread-1' }) })
        )
        expect(command).not.toHaveBeenCalled()
    })

    it('resolves an unsaved test model using a server-loaded provider without modifying the saved model', async () => {
        const { service, query, knowledgebase } = setup()
        await inRequestContext(() =>
            service.getRerankModel('kb-1', undefined, {
                copilotId: 'copilot-1',
                model: 'temporary-rerank',
                modelType: AiModelTypeEnum.RERANK,
                copilot: {
                    id: 'untrusted-copilot',
                    modelProvider: { credentials: { api_key: 'client-value' } }
                } as never
            })
        )
        expect(query).toHaveBeenCalledWith(expect.any(CopilotGetOneQuery))
        expect(query).toHaveBeenCalledWith(
            expect.objectContaining({
                copilot: expect.objectContaining({ id: 'copilot-1' }),
                copilotModel: expect.objectContaining({ model: 'temporary-rerank' })
            })
        )
        expect(knowledgebase.rerankModel.model).toBe('rerank-model')
    })

    it('enforces knowledgebase read access before resolving the rerank model', async () => {
        const { service, workspaceAccess, query } = setup()
        workspaceAccess.assertCan.mockRejectedValue(new ForbiddenException())
        await expect(inRequestContext(() => service.getRerankModel('kb-1'))).rejects.toBeInstanceOf(ForbiddenException)
        expect(query).not.toHaveBeenCalled()
    })

    it('does not initialize the final rerank model during vector candidate retrieval', async () => {
        const previousVectorStore = environment.vectorStore
        environment.vectorStore = VectorTypeEnum.PGVECTOR
        try {
            const { service, knowledgebase, query } = setup({ embeddingsAvailable: true, rerankAvailable: false })
            const retriever = new VectorKnowledgeCandidateRetriever(service, {} as KnowledgeDocumentChunkService)
            const result = await inRequestContext(() =>
                retriever.retrieve({
                    knowledgebase,
                    query: 'quality requirements',
                    scope: { tenantId: 'tenant-1', organizationId: 'org-1' },
                    modelContext: { xpertId: 'xpert-1', threadId: 'thread-1' },
                    preparedFilter: prepareKnowledgeFilter({ knowledgebase, vectorBackend: VectorTypeEnum.PGVECTOR })
                })
            )
            expect(result.candidates).toEqual([])
            expect(query.mock.calls.some(([input]) => input instanceof CopilotModelGetRerankQuery)).toBe(false)
        } finally {
            environment.vectorStore = previousVectorStore
        }
    })
})
