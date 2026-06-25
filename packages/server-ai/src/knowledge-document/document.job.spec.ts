import { ForbiddenException } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { IKnowledgebase, IKnowledgeDocument, KBDocumentStatusEnum } from '@xpert-ai/contracts'
import { UserService } from '@xpert-ai/server-core'
import { Job } from 'bull'
import { CopilotTokenRecordCommand } from '../copilot-user'
import { KnowledgebaseService } from '../knowledgebase'
import { KnowledgeDocLoadCommand } from './commands'
import { computeKnowledgeDocumentProcessingHash } from './document-hash'
import { KnowledgeDocumentConsumer } from './document.job'
import { KnowledgeDocumentService } from './document.service'

let mockContextActive = false

jest.mock('@xpert-ai/server-core', () => {
    const actual = jest.requireActual('@xpert-ai/server-core')
    return {
        ...actual,
        runWithRequestContext: (_req: unknown, next: () => unknown) => {
            mockContextActive = true
            try {
                return next()
            } finally {
                mockContextActive = false
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
        const consumer = new KnowledgeDocumentConsumer(
            null,
            knowledgebaseService as unknown as KnowledgebaseService,
            documentService as unknown as KnowledgeDocumentService,
            userService as unknown as UserService,
            commandBus as unknown as CommandBus
        )
        const processJob = jest.spyOn(consumer, '_processJob').mockResolvedValue({})
        const job = {
            data: {
                userId: 'user-id',
                docs: [doc]
            }
        } as Job<{ userId: string; docs: IKnowledgeDocument[] }>

        await expect(consumer.process(job)).resolves.toEqual({})

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
            commandBus as unknown as CommandBus
        )
        const job = {
            id: 'job-1',
            data: {
                userId: 'user-id',
                docs
            }
        } as Job<{ userId: string; docs: IKnowledgeDocument[] }>

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

    it('merges skipped incremental sync statistics into document metadata without overwriting existing metadata', async () => {
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
                { id: 'chunk-1', pageContent: 'chunk 1', metadata: { chunkId: 'chunk-1' } },
                { id: 'chunk-2', pageContent: 'chunk 2', metadata: { chunkId: 'chunk-2' } }
            ]
        } satisfies Partial<IKnowledgeDocument>
        document.processingHash = computeKnowledgeDocumentProcessingHash(document)
        const knowledgebaseService = {
            getActiveVectorStore: jest.fn(async () => ({ embeddingModel: 'embedding-model' }))
        }
        const documentService = {
            findOne: jest.fn(async () => document),
            update: jest.fn()
        }
        const commandBus = {
            execute: jest.fn()
        }
        const consumer = new KnowledgeDocumentConsumer(
            null,
            knowledgebaseService as unknown as KnowledgebaseService,
            documentService as unknown as KnowledgeDocumentService,
            {} as unknown as UserService,
            commandBus as unknown as CommandBus
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

        expect(commandBus.execute).not.toHaveBeenCalledWith(expect.any(KnowledgeDocLoadCommand))
        expect(documentService.update).toHaveBeenCalledWith(
            'doc-1',
            expect.objectContaining({
                status: KBDocumentStatusEnum.FINISH,
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
            commandBus as unknown as CommandBus
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

    it('writes chunk incremental sync statistics and actual embedding token usage into document metadata', async () => {
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
            { id: 'chunk-added', pageContent: 'added content', metadata: { chunkId: 'chunk-added' } },
            { id: 'chunk-updated', pageContent: 'updated content', metadata: { chunkId: 'chunk-updated' } }
        ]
        const embeddingChunks = [allChunks[1], allChunks[2]]
        const vectorStore = {
            embeddingModel: 'embedding-model',
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
            commandBus as unknown as CommandBus
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
            embeddingChunks.map((chunk) => ({
                id: chunk.id,
                metadata: chunk.metadata
            }))
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
            commandBus as unknown as CommandBus
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
        expect(finishUpdate?.[1]).toEqual(expect.objectContaining({ contentHash: 'new-content-hash' }))
    })
})
