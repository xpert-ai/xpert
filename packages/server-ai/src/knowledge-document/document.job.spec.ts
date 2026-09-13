import { ForbiddenException } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import {
    AiModelTypeEnum,
    IKnowledgebase,
    IKnowledgeDocument,
    IModelAccessResolution,
    KBDocumentStatusEnum,
    KBDocumentCategoryEnum,
    KnowledgeTableMetadata,
    KnowledgeTableSource,
    KnowledgebaseTypeEnum,
    ModelAccessChannelEnum,
    ModelAccessOwnershipScopeEnum,
    ModelAccessSourceEnum
} from '@xpert-ai/contracts'
import { countTextTokens, RequestContext as PluginRequestContext } from '@xpert-ai/plugin-sdk'
import { UserService } from '@xpert-ai/server-core'
import { Job } from 'bull'
import { CopilotTokenRecordCommand } from '../copilot-user'
import { KnowledgebaseService } from '../knowledgebase'
import { KnowledgeDocLoadCommand } from './commands'
import { computeKnowledgeDocumentProcessingHash } from './document-hash'
import { KnowledgeDocumentConsumer } from './document.job'
import { KnowledgeProcessingReadyService } from './processing-lifecycle.module'
import { KnowledgeDocumentService } from './document.service'
import { KnowledgeDerivedIndexPublicationService } from './derived-index-publication.service'
import { projectTableMetadata } from './tables/table-metadata'
import { TableMetadataStaleError } from './tables/table-metadata.service'
import { conservativeEmbeddingTokenCount } from './embedding-input-guard'
import { Document } from '@langchain/core/documents'
import { ChunkMetadata } from '@xpert-ai/plugin-sdk'

function readyProcessing() {
    const ready = new KnowledgeProcessingReadyService()
    ready.onApplicationBootstrap()
    return ready
}

let mockContextActive = false

jest.mock('@xpert-ai/server-core', () => {
    const actual = jest.requireActual('@xpert-ai/server-core')
    return {
        ...actual,
        runWithRequestContext: (_req: unknown, next: () => unknown) => {
            mockContextActive = true
            try {
                const result = next()
                if (result && typeof (result as Promise<unknown>).finally === 'function') {
                    return (result as Promise<unknown>).finally(() => {
                        mockContextActive = false
                    })
                }
                mockContextActive = false
                return result
            } catch (error) {
                mockContextActive = false
                throw error
            }
        }
    }
})

jest.mock('../knowledgebase', () => ({
    KnowledgebaseService: class KnowledgebaseService {},
    KnowledgeDocumentStore: class KnowledgeDocumentStore {}
}))

jest.mock('./document.service', () => ({
    KnowledgeDocumentService: class KnowledgeDocumentService {}
}))

jest.mock('./tables/table-metadata.service', () => ({
    KnowledgeTableMetadataService: class {},
    TableMetadataStaleError: class extends Error {}
}))

describe('KnowledgeDocumentConsumer', () => {
    it('loads the knowledgebase inside the queued document request context', async () => {
        const doc = {
            id: 'doc-id',
            tenantId: 'tenant-id',
            organizationId: 'organization-id',
            knowledgebaseId: 'knowledgebase-id',
            status: KBDocumentStatusEnum.RUNNING
        } satisfies Partial<IKnowledgeDocument>

        const knowledgebaseService = {
            findOne: jest.fn(async () => {
                if (!mockContextActive) {
                    throw new ForbiddenException('Tenant context is required.')
                }
                if (PluginRequestContext.getOrganizationId() !== 'organization-id') {
                    throw new ForbiddenException('Plugin organization context is required.')
                }
                return {
                    id: 'knowledgebase-id',
                    organizationId: 'organization-id'
                }
            })
        }
        const documentService = {
            update: jest.fn()
        }
        const userService = {
            findOne: jest.fn(async () => ({
                id: 'user-id',
                tenantId: 'tenant-id',
                preferredLanguage: 'zh-Hans'
            }))
        }
        const commandBus = {}
        const lifecycle = new KnowledgeProcessingReadyService()
        const consumer = new KnowledgeDocumentConsumer(
            null,
            knowledgebaseService as unknown as KnowledgebaseService,
            documentService as unknown as KnowledgeDocumentService,
            userService as unknown as UserService,
            commandBus as unknown as CommandBus,
            { publish: jest.fn() } as unknown as KnowledgeDerivedIndexPublicationService,
            lifecycle
        )
        const processJob = jest.spyOn(consumer, '_processJob').mockResolvedValue({})
        const job = {
            data: {
                userId: 'user-id',
                docs: [doc]
            }
        } as Job<{ userId: string; docs: IKnowledgeDocument[] }>

        const processing = consumer.process(job)
        await Promise.resolve()
        expect(userService.findOne).not.toHaveBeenCalled()
        expect(processJob).not.toHaveBeenCalled()
        lifecycle.onApplicationBootstrap()
        await expect(processing).resolves.toEqual({})

        expect(knowledgebaseService.findOne).toHaveBeenCalled()
        expect(processJob).toHaveBeenCalled()
        expect(documentService.update).not.toHaveBeenCalled()
    })

    it('keeps processing remaining queued documents after one document fails', async () => {
        const docs = [
            {
                id: 'doc-1',
                knowledgebaseId: 'knowledgebase-id',
                status: KBDocumentStatusEnum.RUNNING
            },
            {
                id: 'doc-2',
                knowledgebaseId: 'knowledgebase-id',
                status: KBDocumentStatusEnum.RUNNING
            }
        ] satisfies Partial<IKnowledgeDocument>[]
        const knowledgebaseService = {
            getActiveVectorStore: jest.fn(async () => ({}))
        }
        const documentService = {
            findOne: jest.fn(async (id: string) => docs.find((doc) => doc.id === id)),
            update: jest.fn()
        }
        const commandBus = {
            execute: jest.fn(async (command: unknown) => {
                if (command instanceof KnowledgeDocLoadCommand) {
                    if (command.input.doc.id === 'doc-1') {
                        throw new Error('missing source file')
                    }
                    return {}
                }
                return {}
            })
        }
        const consumer = new KnowledgeDocumentConsumer(
            null,
            knowledgebaseService as unknown as KnowledgebaseService,
            documentService as unknown as KnowledgeDocumentService,
            {} as unknown as UserService,
            commandBus as unknown as CommandBus,
            { publish: jest.fn() } as unknown as KnowledgeDerivedIndexPublicationService,
            readyProcessing()
        )
        const job = {
            id: 'job-1',
            data: {
                userId: 'user-id',
                docs,
                mode: 'rechunk'
            }
        } as unknown as Job<{ userId: string; docs: IKnowledgeDocument[]; mode?: 'full' | 'rechunk' }>

        await expect(
            consumer._processJob(
                {
                    id: 'knowledgebase-id',
                    tenantId: 'tenant-id',
                    organizationId: 'organization-id',
                    copilotModel: { copilot: { id: 'copilot-id' } }
                } as unknown as IKnowledgebase,
                docs as IKnowledgeDocument[],
                job
            )
        ).resolves.toEqual({})

        expect(
            commandBus.execute.mock.calls.filter(([command]) => command instanceof KnowledgeDocLoadCommand)
        ).toHaveLength(2)
        expect(
            commandBus.execute.mock.calls
                .map(([command]) => command)
                .filter((command): command is KnowledgeDocLoadCommand => command instanceof KnowledgeDocLoadCommand)
                .every((command) => command.input.mode === 'rechunk')
        ).toBe(true)
        expect(documentService.update).toHaveBeenCalledWith(
            'doc-1',
            expect.objectContaining({
                status: KBDocumentStatusEnum.ERROR,
                processMsg: 'missing source file'
            })
        )
        expect(documentService.update).toHaveBeenCalledWith(
            'doc-2',
            expect.objectContaining({
                status: KBDocumentStatusEnum.FINISH,
                progress: 100
            })
        )
    })

    it('repairs source token statistics on unchanged documents without embedding again or losing metadata', async () => {
        const document = {
            id: 'doc-1',
            name: 'policy.md',
            knowledgebaseId: 'knowledgebase-id',
            sourceHash: 'source-hash',
            processingHash: 'processing-hash',
            contentHash: 'content-hash',
            status: KBDocumentStatusEnum.FINISH,
            metadata: { owner: 'alice' },
            parserId: 'default',
            parserConfig: {},
            type: 'md',
            filePath: 'policy.md',
            chunks: [
                { id: 'chunk-1', pageContent: 'Unicode <|endoftext|>', metadata: { chunkId: 'chunk-1', tokens: 1 } },
                { id: 'chunk-2', pageContent: 'chunk 2', metadata: { chunkId: 'chunk-2' } }
            ]
        } satisfies Partial<IKnowledgeDocument>
        document.processingHash = computeKnowledgeDocumentProcessingHash(document)
        const knowledgebaseService = {
            getActiveVectorStore: jest.fn(async () => ({ embeddingModel: 'embedding-model' }))
        }
        const documentService = {
            findOne: jest.fn(async () => document),
            findAllEmbeddingNodes: jest.fn(async () => document.chunks),
            updateChunkMetadataBulk: jest.fn(),
            update: jest.fn()
        }
        const commandBus = {
            execute: jest.fn()
        }
        const publication = { publish: jest.fn() }
        const consumer = new KnowledgeDocumentConsumer(
            null,
            knowledgebaseService as unknown as KnowledgebaseService,
            documentService as unknown as KnowledgeDocumentService,
            {} as unknown as UserService,
            commandBus as unknown as CommandBus,
            publication as unknown as KnowledgeDerivedIndexPublicationService,
            readyProcessing()
        )
        const job = {
            id: 'job-1',
            data: {
                userId: 'user-id',
                docs: [document]
            }
        } as unknown as Job<{ userId: string; docs: IKnowledgeDocument[] }>

        await consumer._processJob(
            {
                id: 'knowledgebase-id',
                tenantId: 'tenant-id',
                organizationId: 'organization-id',
                copilotModel: { copilot: { id: 'copilot-id' } }
            } as unknown as IKnowledgebase,
            [document as unknown as IKnowledgeDocument],
            job
        )

        expect(publication.publish).toHaveBeenCalledWith(
            expect.objectContaining({ documentId: 'doc-1', contentChanged: false })
        )
        expect(commandBus.execute).not.toHaveBeenCalledWith(expect.any(KnowledgeDocLoadCommand))
        expect(commandBus.execute).not.toHaveBeenCalledWith(expect.any(CopilotTokenRecordCommand))
        expect(documentService.updateChunkMetadataBulk).toHaveBeenCalledWith(
            document.chunks.map((chunk) => ({
                id: chunk.id,
                metadata: { chunkId: chunk.metadata.chunkId, tokens: countTextTokens(chunk.pageContent) }
            }))
        )
        expect(documentService.update).toHaveBeenCalledWith(
            'doc-1',
            expect.objectContaining({
                status: KBDocumentStatusEnum.FINISH,
                tokenNum: document.chunks.reduce((sum, chunk) => sum + countTextTokens(chunk.pageContent), 0),
                metadata: expect.objectContaining({
                    owner: 'alice',
                    lastIncrementalSync: expect.objectContaining({
                        mode: 'skipped',
                        total: 2,
                        skipped: 2,
                        added: 0,
                        updated: 0,
                        deleted: 0,
                        embeddingTokens: 0,
                        processedAt: expect.any(String)
                    })
                })
            })
        )
    })

    it('reprocesses unchanged hashes when the previous document status was not finished', async () => {
        const document = {
            id: 'doc-1',
            name: 'policy.md',
            knowledgebaseId: 'knowledgebase-id',
            sourceHash: 'source-hash',
            processingHash: 'processing-hash',
            contentHash: 'content-hash',
            status: KBDocumentStatusEnum.ERROR,
            metadata: { owner: 'alice' },
            parserId: 'default',
            parserConfig: {},
            type: 'md',
            filePath: 'policy.md',
            chunks: [{ id: 'chunk-1', pageContent: 'chunk 1', metadata: { chunkId: 'chunk-1' } }]
        } satisfies Partial<IKnowledgeDocument>
        document.processingHash = computeKnowledgeDocumentProcessingHash(document)
        const vectorStore = {
            embeddingModel: 'embedding-model',
            addKnowledgeDocument: jest.fn()
        }
        const knowledgebaseService = {
            getActiveVectorStore: jest.fn(async () => vectorStore)
        }
        const documentService = {
            findOne: jest.fn(async () => document),
            findAllEmbeddingNodes: jest.fn(async () => document.chunks),
            save: jest.fn(),
            updateChunkMetadataBulk: jest.fn(),
            syncChunksIncrementally: jest.fn(async () => ({
                chunks: document.chunks,
                embeddingChunks: [],
                removedChunks: [],
                contentHash: document.contentHash,
                contentChanged: false,
                statistics: {
                    total: 1,
                    skipped: 1,
                    added: 0,
                    updated: 0,
                    deleted: 0
                }
            })),
            update: jest.fn()
        }
        const commandBus = {
            execute: jest.fn(async (command: unknown) => {
                if (command instanceof KnowledgeDocLoadCommand) {
                    return { chunks: document.chunks }
                }
                return {}
            })
        }
        const consumer = new KnowledgeDocumentConsumer(
            null,
            knowledgebaseService as unknown as KnowledgebaseService,
            documentService as unknown as KnowledgeDocumentService,
            {} as unknown as UserService,
            commandBus as unknown as CommandBus,
            { publish: jest.fn() } as unknown as KnowledgeDerivedIndexPublicationService,
            readyProcessing()
        )
        const job = {
            id: 'job-1',
            data: {
                userId: 'user-id',
                docs: [document]
            }
        } as unknown as Job<{ userId: string; docs: IKnowledgeDocument[] }>

        await consumer._processJob(
            {
                id: 'knowledgebase-id',
                tenantId: 'tenant-id',
                organizationId: 'organization-id',
                parserConfig: { embeddingBatchSize: 10 },
                copilotModel: { copilot: { id: 'copilot-id' } }
            } as unknown as IKnowledgebase,
            [document as unknown as IKnowledgeDocument],
            job
        )

        expect(
            commandBus.execute.mock.calls.filter(([command]) => command instanceof KnowledgeDocLoadCommand)
        ).toHaveLength(1)
        expect(documentService.syncChunksIncrementally).toHaveBeenCalled()
    })

    it.each([
        { content: 'added content', searchContent: undefined },
        { content: 'Unicode e\u0301 \ud83d\ude00 <|endoftext|> '.repeat(8), searchContent: undefined },
        { content: 'Full source row with additional display fields', searchContent: 'Indexed field' }
    ])('keeps source tokens separate from embedding usage: %j', async ({ content, searchContent }) => {
        const document = {
            id: 'doc-1',
            name: 'policy.md',
            knowledgebaseId: 'knowledgebase-id',
            sourceHash: 'source-hash',
            processingHash: 'old-processing-hash',
            contentHash: 'old-content-hash',
            metadata: { owner: 'alice' },
            parserId: 'default',
            parserConfig: {},
            type: 'md',
            filePath: 'policy.md'
        } satisfies Partial<IKnowledgeDocument>
        const allChunks = [
            { id: 'chunk-old', pageContent: 'kept content', metadata: { chunkId: 'chunk-old' } },
            {
                id: 'chunk-added',
                pageContent: content,
                metadata: { chunkId: 'chunk-added', tokens: countTextTokens(content), searchContent }
            },
            { id: 'chunk-updated', pageContent: 'updated content', metadata: { chunkId: 'chunk-updated' } }
        ]
        const embeddingChunks = [allChunks[1], allChunks[2]]
        const modelAccess: IModelAccessResolution = {
            allowed: true,
            billableUserId: 'user-id',
            copilotId: 'copilot-id',
            copilotModelId: 'embedding-model',
            provider: 'embedding-provider',
            modelType: AiModelTypeEnum.TEXT_EMBEDDING,
            model: 'embedding-model',
            channel: ModelAccessChannelEnum.Xpert,
            accessSource: ModelAccessSourceEnum.Grant,
            grantId: 'grant-id',
            multiplier: 1,
            scope: ModelAccessOwnershipScopeEnum.Organization,
            organizationId: 'organization-id'
        }
        const vectorStore = {
            embeddingModel: 'embedding-model',
            modelAccess,
            addKnowledgeDocument: jest.fn()
        }
        const knowledgebaseService = {
            getActiveVectorStore: jest.fn(async () => vectorStore)
        }
        const documentService = {
            findOne: jest.fn(async () => document),
            findAllEmbeddingNodes: jest.fn(async () => allChunks),
            save: jest.fn(),
            updateChunkMetadataBulk: jest.fn(),
            syncChunksIncrementally: jest.fn(async () => ({
                chunks: allChunks,
                embeddingChunks,
                removedChunks: [{ id: 'chunk-deleted' }],
                contentHash: 'new-content-hash',
                contentChanged: true,
                statistics: {
                    total: 3,
                    skipped: 1,
                    added: 1,
                    updated: 1,
                    deleted: 1
                }
            })),
            update: jest.fn()
        }
        const commandBus = {
            execute: jest.fn(async (command: unknown) => {
                if (command instanceof KnowledgeDocLoadCommand) {
                    return { chunks: allChunks }
                }
                return {}
            })
        }
        const consumer = new KnowledgeDocumentConsumer(
            null,
            knowledgebaseService as unknown as KnowledgebaseService,
            documentService as unknown as KnowledgeDocumentService,
            {} as unknown as UserService,
            commandBus as unknown as CommandBus,
            { publish: jest.fn() } as unknown as KnowledgeDerivedIndexPublicationService,
            readyProcessing()
        )
        const job = {
            id: 'job-1',
            data: {
                userId: 'user-id',
                docs: [document]
            }
        } as unknown as Job<{ userId: string; docs: IKnowledgeDocument[] }>

        await consumer._processJob(
            {
                id: 'knowledgebase-id',
                tenantId: 'tenant-id',
                organizationId: 'organization-id',
                parserConfig: { embeddingBatchSize: 10 },
                copilotModel: { copilot: { id: 'copilot-id' } }
            } as unknown as IKnowledgebase,
            [document as unknown as IKnowledgeDocument],
            job
        )

        const embeddingTokenUsed = commandBus.execute.mock.calls
            .map(([command]) => command)
            .filter((command): command is CopilotTokenRecordCommand => command instanceof CopilotTokenRecordCommand)
            .reduce((total, command) => total + (command.input.tokenUsed ?? 0), 0)
        const tokenRecordCommand = commandBus.execute.mock.calls
            .map(([command]) => command)
            .find((command): command is CopilotTokenRecordCommand => command instanceof CopilotTokenRecordCommand)
        expect(tokenRecordCommand?.input.modelAccess).toBe(modelAccess)
        expect(documentService.update).toHaveBeenCalledWith(
            'doc-1',
            expect.objectContaining({
                status: KBDocumentStatusEnum.FINISH,
                metadata: expect.objectContaining({
                    owner: 'alice',
                    lastIncrementalSync: expect.objectContaining({
                        mode: 'incremental',
                        total: 3,
                        skipped: 1,
                        added: 1,
                        updated: 1,
                        deleted: 1,
                        embeddingTokens: embeddingTokenUsed,
                        processedAt: expect.any(String)
                    })
                })
            })
        )
        expect(documentService.updateChunkMetadataBulk).toHaveBeenCalledWith(
            [allChunks[0], allChunks[2]].map((chunk) => ({
                id: chunk.id,
                metadata: { chunkId: chunk.metadata.chunkId, tokens: countTextTokens(chunk.pageContent) }
            }))
        )
        expect(allChunks[1].metadata.tokens).toBe(countTextTokens(content))
        expect(documentService.update).toHaveBeenCalledWith(
            'doc-1',
            expect.objectContaining({
                tokenNum: allChunks.reduce((sum, chunk) => sum + countTextTokens(chunk.pageContent), 0)
            })
        )
        expect(documentService.save).not.toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    id: 'chunk-added'
                })
            ])
        )
    })

    it('writes document content hash only after embedding batches complete', async () => {
        const document = {
            id: 'doc-1',
            name: 'policy.md',
            knowledgebaseId: 'knowledgebase-id',
            sourceHash: 'source-hash',
            processingHash: 'old-processing-hash',
            contentHash: 'old-content-hash',
            metadata: { owner: 'alice' },
            parserId: 'default',
            parserConfig: {},
            type: 'md',
            filePath: 'policy.md'
        } satisfies Partial<IKnowledgeDocument>
        const chunks = [{ id: 'chunk-added', pageContent: 'added content', metadata: { chunkId: 'chunk-added' } }]
        const vectorStore = {
            embeddingModel: 'embedding-model',
            addKnowledgeDocument: jest.fn()
        }
        const knowledgebaseService = {
            getActiveVectorStore: jest.fn(async () => vectorStore)
        }
        const documentService = {
            findOne: jest.fn(async () => document),
            findAllEmbeddingNodes: jest.fn(async () => chunks),
            save: jest.fn(),
            updateChunkMetadataBulk: jest.fn(),
            syncChunksIncrementally: jest.fn(async () => ({
                chunks,
                embeddingChunks: chunks,
                removedChunks: [],
                contentHash: 'new-content-hash',
                contentChanged: true,
                statistics: {
                    total: 1,
                    skipped: 0,
                    added: 1,
                    updated: 0,
                    deleted: 0
                }
            })),
            update: jest.fn()
        }
        const commandBus = {
            execute: jest.fn(async (command: unknown) => {
                if (command instanceof KnowledgeDocLoadCommand) {
                    return { chunks }
                }
                return {}
            })
        }
        const consumer = new KnowledgeDocumentConsumer(
            null,
            knowledgebaseService as unknown as KnowledgebaseService,
            documentService as unknown as KnowledgeDocumentService,
            {} as unknown as UserService,
            commandBus as unknown as CommandBus,
            { publish: jest.fn() } as unknown as KnowledgeDerivedIndexPublicationService,
            readyProcessing()
        )
        const job = {
            id: 'job-1',
            data: {
                userId: 'user-id',
                docs: [document]
            }
        } as unknown as Job<{ userId: string; docs: IKnowledgeDocument[] }>

        await consumer._processJob(
            {
                id: 'knowledgebase-id',
                tenantId: 'tenant-id',
                organizationId: 'organization-id',
                parserConfig: { embeddingBatchSize: 10 },
                copilotModel: { copilot: { id: 'copilot-id' } }
            } as unknown as IKnowledgebase,
            [document as unknown as IKnowledgeDocument],
            job
        )

        const embeddingStartUpdate = documentService.update.mock.calls.find(
            ([, updates]) => updates.status === KBDocumentStatusEnum.EMBEDDING && updates.progress === 0
        )
        expect(embeddingStartUpdate?.[1]).not.toHaveProperty('contentHash')

        const finishUpdate = documentService.update.mock.calls.find(
            ([, updates]) => updates.status === KBDocumentStatusEnum.FINISH
        )
        expect(finishUpdate?.[1]).toEqual(
            expect.objectContaining({
                contentHash: 'new-content-hash',
                publicationEpoch: expect.any(Function)
            })
        )
    })

    it('applies the embedding context guard before incrementally persisting oversized chunks', async () => {
        const document = {
            id: 'doc-bom',
            name: '24J0708AN839 BOM.xls',
            knowledgebaseId: 'knowledgebase-id',
            status: KBDocumentStatusEnum.RUNNING,
            metadata: {},
            parserId: 'default',
            parserConfig: {},
            type: 'xls',
            filePath: '24J0708AN839 BOM.xls'
        } satisfies Partial<IKnowledgeDocument>
        const oversizedChunk = {
            pageContent: Array.from(
                { length: 100 },
                (_, index) => `- Row ${index}: ${'84350022-01A-R '.repeat(8)}\n`
            ).join(''),
            metadata: { chunkId: 'bom-sheet-1', spreadsheetInterpretation: 'form_document' }
        }
        const vectorStore = { embeddingModel: 'text-embedding-v4', addKnowledgeDocument: jest.fn() }
        const knowledgebaseService = { getActiveVectorStore: jest.fn(async () => vectorStore) }
        const documentService = {
            findOne: jest.fn(async () => document),
            findAllEmbeddingNodes: jest.fn(async () => []),
            syncChunksIncrementally: jest.fn(async (input: IKnowledgeDocument) => ({
                chunks: input.chunks,
                embeddingChunks: [],
                removedChunks: [],
                contentHash: 'guarded-content-hash',
                contentChanged: false,
                statistics: {
                    total: input.chunks.length,
                    skipped: input.chunks.length,
                    added: 0,
                    updated: 0,
                    deleted: 0
                }
            })),
            update: jest.fn()
        }
        const commandBus = {
            execute: jest.fn(async (command: unknown) =>
                command instanceof KnowledgeDocLoadCommand ? { chunks: [oversizedChunk] } : {}
            )
        }
        const consumer = new KnowledgeDocumentConsumer(
            null,
            knowledgebaseService as unknown as KnowledgebaseService,
            documentService as unknown as KnowledgeDocumentService,
            {} as unknown as UserService,
            commandBus as unknown as CommandBus,
            { publish: jest.fn() } as unknown as KnowledgeDerivedIndexPublicationService,
            readyProcessing()
        )
        const job = {
            id: 'job-bom',
            data: { userId: 'user-id', docs: [document] }
        } as unknown as Job<{ userId: string; docs: IKnowledgeDocument[] }>

        await consumer._processJob(
            {
                id: 'knowledgebase-id',
                tenantId: 'tenant-id',
                organizationId: 'organization-id',
                copilotModel: { options: { context_size: 256 }, copilot: { id: 'copilot-id' } }
            } as unknown as IKnowledgebase,
            [document as unknown as IKnowledgeDocument],
            job
        )

        const guardedChunks = documentService.syncChunksIncrementally.mock.calls[0][0].chunks
        expect(guardedChunks.length).toBeGreaterThan(1)
        expect(
            guardedChunks.every((chunk: { pageContent: string }) => Array.from(chunk.pageContent).length <= 192)
        ).toBe(true)
    })
})

describe('KnowledgeDocumentConsumer table processing', () => {
    function fixture() {
        const document: IKnowledgeDocument = {
            id: 'table-doc',
            name: 'Orders.csv',
            parserId: 'default',
            filePath: 'Orders.csv',
            type: 'csv',
            category: KBDocumentCategoryEnum.Sheet,
            status: KBDocumentStatusEnum.RUNNING,
            jobId: 'table-job',
            sourceHash: 'source',
            version: 1,
            tenantId: 'tenant',
            organizationId: 'org',
            knowledgebaseId: 'kb',
            metadata: {},
            parserConfig: { indexedFields: ['amount'] }
        }
        const source: KnowledgeTableSource = {
            tableId: 'orders',
            sheetName: 'Orders',
            range: 'A1:A2',
            rowCount: 1,
            columns: [{ columnId: 'A', key: 'amount', label: 'amount', column: 1 }],
            samples: []
        }
        const state: KnowledgeTableMetadata = {
            schemaVersion: 1,
            status: 'generated',
            generationId: 'g',
            inputHash: 'i',
            resultHash: 'r',
            updatedAt: '',
            tables: [{ ...source, summary: 'Orders', columns: [{ ...source.columns[0], description: 'Order amount' }] }]
        }
        let savedChunks: Document<ChunkMetadata>[] = []
        const chunks = [
            new Document<ChunkMetadata>({
                pageContent: 'Full source row including display-only fields',
                metadata: {
                    chunkId: 'row',
                    searchContent: 'x'.repeat(200),
                    tableSource: { tableId: 'orders', rowNumber: 2 }
                }
            })
        ]
        const vectorStore = { embeddingModel: 'embedding', addKnowledgeDocument: jest.fn() }
        const knowledgebaseService = { getActiveVectorStore: jest.fn(async () => vectorStore) }
        const documentService = {
            findOne: jest.fn(async () => document),
            update: jest.fn(),
            updateChunkMetadataBulk: jest.fn(),
            findAllEmbeddingNodes: jest.fn(async () => savedChunks),
            syncChunksIncrementally: jest.fn(async (input: IKnowledgeDocument) => {
                savedChunks = input.chunks
                return {
                    chunks: savedChunks,
                    embeddingChunks: savedChunks,
                    removedChunks: [],
                    contentHash: 'new-content',
                    contentChanged: true,
                    statistics: {
                        total: savedChunks.length,
                        added: savedChunks.length,
                        updated: 0,
                        skipped: 0,
                        deleted: 0
                    }
                }
            })
        }
        const commandBus = {
            execute: jest.fn(async (command: unknown) =>
                command instanceof KnowledgeDocLoadCommand ? { chunks, tables: [source] } : {}
            )
        }
        const publication = { publish: jest.fn() }
        const metadata = {
            canSkip: jest.fn(() => false),
            prepare: jest.fn(async () => state),
            assertIndexCurrent: jest.fn(async () => undefined),
            project: projectTableMetadata,
            markApplied: jest.fn(async () => true)
        }
        const consumer = new KnowledgeDocumentConsumer(
            null,
            knowledgebaseService as unknown as KnowledgebaseService,
            documentService as unknown as KnowledgeDocumentService,
            {} as UserService,
            commandBus as unknown as CommandBus,
            publication as unknown as KnowledgeDerivedIndexPublicationService,
            readyProcessing()
        )
        Object.assign(consumer, { tableMetadata: metadata })
        const knowledgebase = {
            id: 'kb',
            name: 'Orders',
            type: KnowledgebaseTypeEnum.Standard,
            tenantId: 'tenant',
            organizationId: 'org',
            parserConfig: { embeddingBatchSize: 10 },
            copilotModel: { copilot: { id: 'copilot' }, options: { context_size: 128 } }
        } as IKnowledgebase
        const run = () =>
            consumer._processJob(knowledgebase, [document], {
                id: 'table-job',
                data: { userId: 'user', docs: [document] }
            } as Job)
        return { run, document, source, state, metadata, documentService, vectorStore, publication, commandBus }
    }

    it('guards original rows before enrichment and publishes the result only after successful embedding', async () => {
        const f = fixture()
        await f.run()
        const chunks = f.documentService.syncChunksIncrementally.mock.calls[0][0].chunks
        expect(chunks).toHaveLength(3)
        expect(chunks.every((chunk) => chunk.pageContent === 'Full source row including display-only fields')).toBe(
            true
        )
        expect(chunks.every((chunk) => conservativeEmbeddingTokenCount(chunk.metadata.searchContent) <= 96)).toBe(true)
        expect(chunks.every((chunk) => chunk.metadata.tableMetadataResultHash === 'r')).toBe(true)
        expect(f.metadata.prepare).toHaveBeenCalledWith(
            f.document,
            expect.any(Object),
            [f.source],
            expect.stringMatching(/^[a-f0-9]{64}$/)
        )
        expect(f.metadata.markApplied.mock.invocationCallOrder[0]).toBeGreaterThan(
            f.vectorStore.addKnowledgeDocument.mock.invocationCallOrder[0]
        )
        expect(f.publication.publish).toHaveBeenCalled()
    })

    it('leaves parsed rows available when optional metadata generation fails', async () => {
        const f = fixture()
        f.state.status = 'failed'
        delete f.state.resultHash
        await f.run()
        expect(f.vectorStore.addKnowledgeDocument).toHaveBeenCalled()
        expect(f.documentService.update).toHaveBeenCalledWith(
            'table-doc',
            expect.objectContaining({ status: KBDocumentStatusEnum.FINISH })
        )
    })

    it('does not mark generated metadata applied when embedding fails', async () => {
        const f = fixture()
        f.vectorStore.addKnowledgeDocument.mockRejectedValueOnce(new Error('index unavailable'))
        await f.run()
        expect(f.metadata.markApplied).not.toHaveBeenCalled()
        expect(f.publication.publish).not.toHaveBeenCalled()
    })

    it('never adopts the new job identity when a superseded job loads the document again', async () => {
        const f = fixture()
        f.document.jobId = 'new-job'
        await f.run()
        expect(f.commandBus.execute).not.toHaveBeenCalled()
        expect(f.documentService.update).not.toHaveBeenCalled()
        expect(f.metadata.prepare).not.toHaveBeenCalled()
    })

    it('does not turn a superseded generation into a document failure or overwrite its chunks', async () => {
        const f = fixture()
        f.metadata.prepare.mockRejectedValueOnce(new TableMetadataStaleError())
        await f.run()
        expect(f.documentService.syncChunksIncrementally).not.toHaveBeenCalled()
        expect(f.documentService.update).not.toHaveBeenCalled()
    })

    it('stops before replacing chunks if a newer job takes ownership after generation', async () => {
        const f = fixture()
        f.metadata.assertIndexCurrent.mockRejectedValueOnce(new TableMetadataStaleError())
        await f.run()
        expect(f.documentService.syncChunksIncrementally).not.toHaveBeenCalled()
        expect(f.vectorStore.addKnowledgeDocument).not.toHaveBeenCalled()
        expect(f.metadata.markApplied).not.toHaveBeenCalled()
    })
})
