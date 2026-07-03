import { AiProviderRole } from '@xpert-ai/contracts'
import { CopilotOneByRoleQuery } from '../copilot'
import { CopilotModelGetEmbeddingsQuery } from '../copilot-model'
import { createEmbeddingFingerprint } from '../knowledgebase/embedding-state'
import { RagCreateVStoreCommand } from '../rag-vstore'
import { FileAsset, FileChunk } from './entities'
import { FileUnderstandingVectorService } from './file-understanding-vector.service'

function createService(options?: { addDocuments?: jest.Mock }) {
    const vectorStore = {
        addDocuments: options?.addDocuments ?? jest.fn().mockResolvedValue(undefined),
        similaritySearchWithScore: jest.fn(),
        delete: jest.fn()
    }
    const fileEmbeddingRepository = {
        find: jest.fn().mockResolvedValue([]),
        create: jest.fn((entity) => entity),
        save: jest.fn(async (entities) => entities)
    }
    const commandBus = {
        execute: jest.fn(async (command) => {
            if (command instanceof RagCreateVStoreCommand) {
                return vectorStore
            }
            return null
        })
    }
    const embeddings = {
        embedQuery: jest.fn().mockResolvedValue([0.1, 0.2, 0.3])
    }
    const copilot = {
        id: 'copilot-1',
        role: AiProviderRole.Embedding,
        enabled: true,
        modelProvider: {
            id: 'provider-1',
            providerName: 'openai',
            providerType: 'openai',
            options: { endpoint: 'https://api.example' }
        },
        copilotModel: {
            id: 'model-1',
            model: 'text-embedding-v4',
            options: { dimensions: 3 }
        }
    }
    const queryBus = {
        execute: jest.fn(async (query) => {
            if (query instanceof CopilotOneByRoleQuery) {
                return copilot
            }
            if (query instanceof CopilotModelGetEmbeddingsQuery) {
                return embeddings
            }
            return null
        })
    }
    const service = Reflect.construct(FileUnderstandingVectorService, [
        fileEmbeddingRepository,
        commandBus,
        queryBus
    ]) as FileUnderstandingVectorService
    return {
        service,
        fileEmbeddingRepository,
        commandBus,
        queryBus,
        vectorStore,
        copilot,
        embeddings
    }
}

function asset(overrides: Partial<FileAsset>): FileAsset {
    return {
        id: 'file-1',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        ...overrides
    } as FileAsset
}

function chunk(id: string): FileChunk {
    return {
        id,
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        fileAssetId: 'file-1',
        artifactId: 'artifact-1',
        orderNo: id === 'chunk-1' ? 0 : 1,
        content: `content for ${id}`,
        tokenCount: 4,
        anchor: { chunk: id === 'chunk-1' ? 0 : 1 }
    } as FileChunk
}

function expectedFingerprint() {
    return createEmbeddingFingerprint({
        provider: 'openai',
        model: 'text-embedding-v4',
        dimensions: 3,
        options: { dimensions: 3 },
        providerConfig: {
            providerId: 'provider-1',
            providerName: 'openai',
            providerType: 'openai',
            options: { endpoint: 'https://api.example' }
        }
    })
}

describe('FileUnderstandingVectorService', () => {
    it('uses xpert and embedding fingerprint for the collection when xpertId exists', async () => {
        const { service, commandBus, fileEmbeddingRepository } = createService()

        await service.indexChunks(asset({ xpertId: 'xpert-1', projectId: 'project-1' }), [chunk('chunk-1')])

        const collectionName = (commandBus.execute.mock.calls[0][0] as RagCreateVStoreCommand).config.collectionName
        expect(collectionName).toBe(`file-understanding:xpert:xpert-1:${expectedFingerprint()}`)
        expect(fileEmbeddingRepository.save.mock.calls[0][0][0].metadata).toMatchObject({
            collectionName,
            collectionScope: { type: 'xpert', id: 'xpert-1' },
            fingerprint: expectedFingerprint(),
            dimensions: 3
        })
    })

    it('falls back to project scope and then tenant scope for collection names', async () => {
        const projectCase = createService()
        await projectCase.service.indexChunks(asset({ projectId: 'project-1' }), [chunk('chunk-1')])
        expect((projectCase.commandBus.execute.mock.calls[0][0] as RagCreateVStoreCommand).config.collectionName).toBe(
            `file-understanding:project:project-1:${expectedFingerprint()}`
        )

        const tenantCase = createService()
        await tenantCase.service.indexChunks(asset({}), [chunk('chunk-1')])
        expect((tenantCase.commandBus.execute.mock.calls[0][0] as RagCreateVStoreCommand).config.collectionName).toBe(
            `file-understanding:tenant:tenant-1:${expectedFingerprint()}`
        )
    })

    it('does not throw or save embedding rows when vector writes fail', async () => {
        const { service, fileEmbeddingRepository } = createService({
            addDocuments: jest.fn().mockRejectedValue(new Error('vector down'))
        })

        await expect(service.indexChunks(asset({ xpertId: 'xpert-1' }), [chunk('chunk-1')])).resolves.toEqual([])
        expect(fileEmbeddingRepository.save).not.toHaveBeenCalled()
    })
})
