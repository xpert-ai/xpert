import { createService } from '../testing/document-service.fixture'
import { ConflictException } from '@nestjs/common'
import {
    DocumentSourceProviderCategoryEnum,
    KBDocumentStatusEnum,
    KnowledgebaseTypeEnum,
    KnowledgeStructureEnum,
    classificateDocumentCategory
} from '@xpert-ai/contracts'
import { computeKnowledgeDocumentProcessingHash } from '../document-hash'
import { KnowledgeDocument } from '../document.entity'
import { resolveKnowledgeDocumentParserConfig } from '../parser-config'

describe('KnowledgeDocumentService incremental ingestion', () => {
    it('replays a scoped import receipt after a crash without creating or processing a second document', async () => {
        let stored: { id: string; metadata: Record<string, unknown> } | null = null
        const query = jest.fn()
        const builder = {
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getOne: jest.fn(async () => stored)
        }
        const manager = { query, getRepository: () => ({ createQueryBuilder: () => builder }) }
        const access = jest.fn()
        const service = createService([], {
            repo: { manager: { transaction: async (callback) => callback(manager) } },
            knowledgebaseService: { assertKnowledgebaseWriteAccess: access }
        })
        const create = jest.spyOn(service, 'createDocument').mockImplementation(async (document) => {
            stored = { id: 'imported', metadata: document.metadata }
            return stored as never
        })
        const draft = { knowledgebaseId: 'kb', name: 'a.png', metadata: { sourceHash: 'hash' } }
        await service.createBulkIdempotently([draft], 'batch-item')
        const replay = await service.createBulkIdempotently([draft], 'batch-item')
        expect(create).toHaveBeenCalledTimes(1)
        expect(replay.skippedIds).toEqual(['imported'])
        expect(replay.processableIds).toEqual([])
        expect(access).toHaveBeenCalledWith('kb')
        expect(query).toHaveBeenCalledWith(expect.stringContaining('pg_advisory_xact_lock'), [
            'knowledge-import:kb:batch-item'
        ])
        await expect(
            service.createBulkIdempotently([{ ...draft, metadata: { sourceHash: 'different' } }], 'batch-item')
        ).rejects.toThrow('content conflict')
    })
    it('keeps new document, tree lookup and folder writes on the caller transaction', async () => {
        const outsideSave = jest.fn()
        const save = jest.fn(async (doc) => ({ ...doc, id: 'saved' }))
        const service = createService([], {
            repo: { save: outsideSave },
            knowledgebaseService: {
                assertNotRebuilding: jest.fn(),
                findOneByIdString: jest.fn(async () => ({ id: 'kb', incrementalSyncEnabled: false }))
            }
        })
        const findOneBy = jest.fn(async () => ({ id: 'saved' }))
        const findAncestorsTree = jest.fn(async (doc) => doc)
        const manager = {
            getRepository: jest.fn(() => ({ save })),
            getTreeRepository: jest.fn(() => ({ findOneBy, findAncestorsTree }))
        }
        await service.createBulk([{ knowledgebaseId: 'kb', name: 'test.md', type: 'md' }], manager as never)
        expect(outsideSave).not.toHaveBeenCalled()
        expect(save).toHaveBeenCalledTimes(2)
        expect(save.mock.calls[0][0]).toEqual(
            expect.objectContaining({ tenantId: 'tenant-1', organizationId: 'org-1' })
        )
        expect(findOneBy).toHaveBeenCalledWith({ id: 'saved' })
        expect(save.mock.calls[1][0]).toHaveProperty('folder')
    })

    it('reuses unchanged source documents without scheduling processing', async () => {
        const incoming = {
            knowledgebaseId: 'kb-1',
            sourceType: DocumentSourceProviderCategoryEnum.LocalFile,
            sourceConfig: { key: 'source-node' },
            sourceHash: 'hash-current',
            status: KBDocumentStatusEnum.WAITING,
            name: 'policy.md',
            type: 'md',
            filePath: 'documents/policy.md'
        }
        const existing: Partial<KnowledgeDocument> = {
            id: 'doc-existing',
            ...incoming,
            contentHash: 'content-current',
            processingHash: computeKnowledgeDocumentProcessingHash({
                ...incoming,
                category: classificateDocumentCategory(incoming),
                parserConfig: resolveKnowledgeDocumentParserConfig(incoming)
            }),
            status: KBDocumentStatusEnum.FINISH
        }
        const save = jest.fn()
        const service = createService([], {
            repo: {
                findAndCount: jest.fn(async () => [[existing], 1]),
                save
            },
            knowledgebaseService: {
                assertNotRebuilding: jest.fn(),
                findOneByIdString: jest.fn(async () => ({
                    id: 'kb-1',
                    name: 'Knowledgebase',
                    type: KnowledgebaseTypeEnum.Standard,
                    incrementalSyncEnabled: true
                }))
            }
        })

        const result = await service.createBulkWithIncrementalSync([incoming])

        expect(result.documents).toEqual([existing])
        expect(result.processableIds).toEqual([])
        expect(save).not.toHaveBeenCalled()
    })

    it('updates existing source documents and schedules processing when the source hash changes', async () => {
        const incoming = {
            knowledgebaseId: 'kb-1',
            sourceType: DocumentSourceProviderCategoryEnum.LocalFile,
            sourceConfig: { key: 'source-node' },
            sourceHash: 'hash-new',
            status: KBDocumentStatusEnum.WAITING,
            name: 'policy.md',
            type: 'md',
            filePath: 'documents/policy.md'
        }
        const existing: Partial<KnowledgeDocument> = {
            id: 'doc-existing',
            knowledgebaseId: 'kb-1',
            sourceType: DocumentSourceProviderCategoryEnum.LocalFile,
            sourceConfig: { key: 'source-node' },
            sourceHash: 'hash-old',
            contentHash: 'content-old',
            processingHash: 'processing-old',
            status: KBDocumentStatusEnum.FINISH,
            name: 'policy.md',
            type: 'md',
            filePath: 'documents/policy.md'
        }
        const updated = {
            ...existing,
            sourceHash: 'hash-new',
            status: KBDocumentStatusEnum.WAITING
        } as KnowledgeDocument
        const save = jest.fn(async () => updated)
        const service = createService([], {
            repo: {
                findAndCount: jest.fn(async () => [[existing], 1]),
                save
            },
            knowledgebaseService: {
                assertNotRebuilding: jest.fn(),
                findOneByIdString: jest.fn(async () => ({
                    id: 'kb-1',
                    name: 'Knowledgebase',
                    type: KnowledgebaseTypeEnum.Standard,
                    incrementalSyncEnabled: true
                }))
            }
        })

        const result = await service.createBulkWithIncrementalSync([incoming])

        expect(result.documents).toEqual([updated])
        expect(result.processableIds).toEqual(['doc-existing'])
        expect(save).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'doc-existing',
                sourceHash: 'hash-new',
                status: KBDocumentStatusEnum.WAITING,
                contentHash: 'content-old'
            })
        )
    })

    it('does not skip an unfinished source document even when the processing hash is unchanged', async () => {
        const incoming = {
            knowledgebaseId: 'kb-1',
            sourceType: DocumentSourceProviderCategoryEnum.LocalFile,
            sourceConfig: { key: 'source-node' },
            sourceHash: 'hash-current',
            status: KBDocumentStatusEnum.WAITING,
            name: 'policy.md',
            type: 'md',
            filePath: 'documents/policy.md'
        }
        const existing: Partial<KnowledgeDocument> = {
            id: 'doc-existing',
            ...incoming,
            contentHash: 'content-current',
            processingHash: computeKnowledgeDocumentProcessingHash({
                ...incoming,
                category: classificateDocumentCategory(incoming),
                parserConfig: resolveKnowledgeDocumentParserConfig(incoming)
            }),
            status: KBDocumentStatusEnum.ERROR
        }
        const save = jest.fn(async (document: KnowledgeDocument) => document)
        const service = createService([], {
            repo: {
                findAndCount: jest.fn(async () => [[existing], 1]),
                save
            },
            knowledgebaseService: {
                assertNotRebuilding: jest.fn(),
                findOneByIdString: jest.fn(async () => ({
                    id: 'kb-1',
                    name: 'Knowledgebase',
                    type: KnowledgebaseTypeEnum.Standard,
                    incrementalSyncEnabled: true
                }))
            }
        })

        const result = await service.createBulkWithIncrementalSync([incoming])

        expect(result.processableIds).toEqual(['doc-existing'])
        expect(result.updatedIds).toEqual(['doc-existing'])
        expect(result.skippedIds).toEqual([])
        expect(save).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'doc-existing',
                status: KBDocumentStatusEnum.WAITING
            })
        )
    })

    it('reuses unchanged source documents from the single-document ingestion path', async () => {
        const incoming = {
            knowledgebaseId: 'kb-1',
            sourceType: DocumentSourceProviderCategoryEnum.LocalFile,
            sourceConfig: { key: 'source-node' },
            sourceHash: 'hash-current',
            status: KBDocumentStatusEnum.WAITING,
            name: 'policy.md',
            type: 'md',
            filePath: 'documents/policy.md'
        }
        const existing: Partial<KnowledgeDocument> = {
            id: 'doc-existing',
            ...incoming,
            contentHash: 'content-current',
            processingHash: computeKnowledgeDocumentProcessingHash({
                ...incoming,
                category: classificateDocumentCategory(incoming),
                parserConfig: resolveKnowledgeDocumentParserConfig(incoming)
            }),
            status: KBDocumentStatusEnum.FINISH
        }
        const save = jest.fn()
        const service = createService([], {
            repo: {
                findAndCount: jest.fn(async () => [[existing], 1]),
                save
            },
            knowledgebaseService: {
                assertNotRebuilding: jest.fn(),
                findOneByIdString: jest.fn(async () => ({
                    id: 'kb-1',
                    name: 'Knowledgebase',
                    type: KnowledgebaseTypeEnum.Standard,
                    incrementalSyncEnabled: true
                }))
            }
        })

        const result = await service.createDocumentWithIncrementalSync(incoming)

        expect(result.document).toEqual(existing)
        expect(result.shouldProcess).toBe(false)
        expect(save).not.toHaveBeenCalled()
    })

    it('creates a new document without source matching when knowledgebase incremental sync is disabled', async () => {
        const incoming = {
            knowledgebaseId: 'kb-1',
            sourceType: DocumentSourceProviderCategoryEnum.LocalFile,
            sourceConfig: { key: 'source-node' },
            sourceHash: 'hash-current',
            status: KBDocumentStatusEnum.WAITING,
            name: 'policy.md',
            type: 'md',
            filePath: 'documents/policy.md'
        }
        const existing: Partial<KnowledgeDocument> = {
            id: 'doc-existing',
            ...incoming,
            contentHash: 'content-current',
            processingHash: computeKnowledgeDocumentProcessingHash({
                ...incoming,
                category: classificateDocumentCategory(incoming),
                parserConfig: resolveKnowledgeDocumentParserConfig(incoming)
            }),
            status: KBDocumentStatusEnum.FINISH
        }
        const created = {
            id: 'doc-created',
            ...incoming
        } as KnowledgeDocument
        const findAndCount = jest.fn(async () => [[existing], 1])
        const save = jest.fn(async (document: KnowledgeDocument) => ({
            ...created,
            ...document,
            id: document.id ?? created.id
        }))
        const service = createService([], {
            repo: {
                create: jest.fn((document) => document),
                findAndCount,
                save
            },
            knowledgebaseService: {
                assertNotRebuilding: jest.fn(),
                findOneByIdString: jest.fn(async () => ({
                    id: 'kb-1',
                    name: 'Knowledgebase',
                    type: KnowledgebaseTypeEnum.Standard,
                    incrementalSyncEnabled: false
                }))
            }
        })
        jest.spyOn(service, 'findAncestors').mockResolvedValue([])

        const result = await service.createBulkWithIncrementalSync([incoming])

        expect(result.documents[0].id).toBe('doc-created')
        expect(result.processableIds).toEqual(['doc-created'])
        expect(result.createdIds).toEqual(['doc-created'])
        expect(result.skippedIds).toEqual([])
        expect(findAndCount).not.toHaveBeenCalled()
    })

    it('creates a new document for a different source key even when the source hash matches', async () => {
        const incoming = {
            knowledgebaseId: 'kb-1',
            sourceType: DocumentSourceProviderCategoryEnum.LocalFile,
            sourceKey: 'local-file:source-b',
            sourceHash: 'hash-same',
            status: KBDocumentStatusEnum.WAITING,
            name: 'policy-copy.md',
            type: 'md'
        }
        const existing: Partial<KnowledgeDocument> = {
            id: 'doc-existing',
            knowledgebaseId: 'kb-1',
            sourceType: DocumentSourceProviderCategoryEnum.LocalFile,
            sourceKey: 'local-file:source-a',
            sourceHash: 'hash-same',
            contentHash: 'content-current',
            processingHash: 'processing-current',
            status: KBDocumentStatusEnum.FINISH,
            name: 'policy.md',
            type: 'md'
        }
        const created = {
            id: 'doc-created',
            ...incoming
        } as KnowledgeDocument
        const findAndCount = jest.fn(async (options?: { where?: Partial<KnowledgeDocument> }) => {
            const where = options?.where
            if (where?.sourceKey === existing.sourceKey || where?.sourceHash === existing.sourceHash) {
                return [[existing], 1]
            }
            return [[], 0]
        })
        const save = jest.fn(async (document: KnowledgeDocument) => ({
            ...created,
            ...document,
            id: document.id ?? created.id
        }))
        const service = createService([], {
            repo: {
                create: jest.fn((document) => document),
                findAndCount,
                save
            },
            knowledgebaseService: {
                assertNotRebuilding: jest.fn(),
                findOneByIdString: jest.fn(async () => ({
                    id: 'kb-1',
                    name: 'Knowledgebase',
                    type: KnowledgebaseTypeEnum.Standard,
                    incrementalSyncEnabled: true
                }))
            }
        })
        jest.spyOn(service, 'findAncestors').mockResolvedValue([])

        const result = await service.createBulkWithIncrementalSync([incoming])

        expect(result.documents[0].id).toBe('doc-created')
        expect(result.processableIds).toEqual(['doc-created'])
        expect(result.createdIds).toEqual(['doc-created'])
        expect(result.skippedIds).toEqual([])
    })

    it('creates a new document when no source key can be resolved even when the source hash matches', async () => {
        const incoming = {
            knowledgebaseId: 'kb-1',
            sourceType: DocumentSourceProviderCategoryEnum.LocalFile,
            sourceHash: 'hash-same',
            status: KBDocumentStatusEnum.WAITING,
            type: 'md'
        }
        const existing: Partial<KnowledgeDocument> = {
            id: 'doc-existing',
            knowledgebaseId: 'kb-1',
            sourceType: DocumentSourceProviderCategoryEnum.LocalFile,
            sourceHash: 'hash-same',
            contentHash: 'content-current',
            processingHash: 'processing-current',
            status: KBDocumentStatusEnum.FINISH,
            type: 'md'
        }
        const created = {
            id: 'doc-created',
            ...incoming
        } as KnowledgeDocument
        const findAndCount = jest.fn(async (options?: { where?: Partial<KnowledgeDocument> }) => {
            const where = options?.where
            if (where?.sourceHash === existing.sourceHash) {
                return [[existing], 1]
            }
            return [[], 0]
        })
        const save = jest.fn(async (document: KnowledgeDocument) => ({
            ...created,
            ...document,
            id: document.id ?? created.id
        }))
        const service = createService([], {
            repo: {
                create: jest.fn((document) => document),
                findAndCount,
                save
            },
            knowledgebaseService: {
                assertNotRebuilding: jest.fn(),
                findOneByIdString: jest.fn(async () => ({
                    id: 'kb-1',
                    name: 'Knowledgebase',
                    type: KnowledgebaseTypeEnum.Standard,
                    incrementalSyncEnabled: true
                }))
            }
        })
        jest.spyOn(service, 'findAncestors').mockResolvedValue([])

        const result = await service.createBulkWithIncrementalSync([incoming])

        expect(result.documents[0].id).toBe('doc-created')
        expect(result.processableIds).toEqual(['doc-created'])
        expect(result.createdIds).toEqual(['doc-created'])
        expect(result.skippedIds).toEqual([])
    })

    it('checks all bulk versions before updating any document', async () => {
        const service = createService([], {
            repo: {
                findAndCount: jest.fn(async () => [
                    [
                        {
                            id: 'doc-1',
                            version: 2,
                            knowledgebaseId: 'kb-1'
                        }
                    ],
                    1
                ])
            },
            knowledgebaseService: {
                assertNotRebuilding: jest.fn()
            }
        })
        const updateWithVersion = jest.spyOn(service, 'updateWithVersion')

        await expect(service.updateBulkWithVersion([{ id: 'doc-1', version: 1 }])).rejects.toBeInstanceOf(
            ConflictException
        )
        expect(updateWithVersion).not.toHaveBeenCalled()
    })

    it('checks all bulk versions before deleting any document', async () => {
        const service = createService([], {
            repo: {
                findAndCount: jest.fn(async () => [
                    [
                        {
                            id: 'doc-1',
                            version: 2,
                            knowledgebaseId: 'kb-1'
                        }
                    ],
                    1
                ])
            },
            knowledgebaseService: {
                assertNotRebuilding: jest.fn()
            }
        })
        const deleteWithVersion = jest.spyOn(service, 'deleteWithVersion')

        await expect(service.deleteBulkWithVersion([{ id: 'doc-1', version: 1 }])).rejects.toBeInstanceOf(
            ConflictException
        )
        expect(deleteWithVersion).not.toHaveBeenCalled()
    })
})

describe('KnowledgeDocumentService knowledgebase parser defaults', () => {
    it('snapshots library defaults for new ordinary documents and lets document overrides win', async () => {
        const ensureDocumentChunkStructure = jest.fn()
        const service = createService([], {
            knowledgebaseService: {
                findOneByIdString: jest.fn(async () => ({
                    id: 'kb',
                    type: KnowledgebaseTypeEnum.Standard,
                    parserConfig: {
                        chunkSize: 512,
                        chunkOverlap: 80,
                        delimiter: null,
                        separators: ['！', '？'],
                        imageUnderstandingEnabled: false,
                        imageUnderstanding: { promptTemplate: '中文 {{context}}' },
                        pdfParser: { transformerType: 'default' }
                    }
                })),
                ensureDocumentChunkStructure
            }
        })
        const config = await service.resolveNewDocumentParserConfig({ knowledgebaseId: 'kb', type: 'pdf' }, true)
        expect(config.textSplitter).toMatchObject({ chunkSize: 512, chunkOverlap: 80, separators: ['！', '？'] })
        expect(config.imageUnderstandingType).toBeUndefined()
        expect(config.imageUnderstanding.promptTemplate).toBe('中文 {{context}}')
        expect(config.transformerType).toBe('default')
        expect(ensureDocumentChunkStructure).toHaveBeenCalledWith('kb', KnowledgeStructureEnum.General)
        const override = await service.resolveNewDocumentParserConfig({
            knowledgebaseId: 'kb',
            type: 'pdf',
            parserConfig: {
                chunkSize: 1000,
                chunkOverlap: 0,
                imageUnderstandingEnabled: true
            }
        })
        expect(override.textSplitter).toMatchObject({ chunkSize: 1000, chunkOverlap: 0 })
        expect(override.imageUnderstandingType).toBe('vlm-default')
        expect(ensureDocumentChunkStructure).toHaveBeenCalledTimes(1)
    })

    it('does not claim a chunk structure for folders or mutate a library during a draft preview', async () => {
        const ensureDocumentChunkStructure = jest.fn()
        const service = createService([], {
            knowledgebaseService: {
                findOneByIdString: jest.fn(async () => ({ id: 'kb', type: KnowledgebaseTypeEnum.Standard })),
                ensureDocumentChunkStructure
            }
        })
        await service.resolveNewDocumentParserConfig({ knowledgebaseId: 'kb', type: 'folder' }, true)
        await service.resolveNewDocumentParserConfig({ knowledgebaseId: 'kb', type: 'txt' })
        expect(ensureDocumentChunkStructure).not.toHaveBeenCalled()
    })
})
