jest.mock('@xpert-ai/plugin-sdk', () => ({
    DocumentSourceRegistry: class DocumentSourceRegistry {},
    TextSplitterRegistry: class TextSplitterRegistry {},
    mergeParentChildChunks: jest.fn((_pages, chunks) => chunks)
}))
jest.mock('../knowledgebase', () => ({
    KnowledgebaseService: class KnowledgebaseService {}
}))
jest.mock('../shared', () => ({
    KnowledgeWorkAreaResolver: class KnowledgeWorkAreaResolver {},
    LoadStorageFileCommand: class LoadStorageFileCommand {
        constructor(public readonly input: unknown) {}
    }
}))
jest.mock('@xpert-ai/server-core', () => ({
    RequestContext: {
        currentTenantId: jest.fn(() => 'tenant-1'),
        currentUserId: jest.fn(() => 'user-1')
    },
    transformWhere: jest.fn((where) => where),
    StorageFileService: class StorageFileService {},
    TenantBaseEntity: class TenantBaseEntity {},
    TenantOrganizationBaseEntity: class TenantOrganizationBaseEntity {},
    TenantOrganizationAwareCrudService: class TenantOrganizationAwareCrudService<T> {
        protected readonly repository: any

        constructor(repository: any) {
            this.repository = repository
        }

        async findOne(id: string, options?: object) {
            return this.repository.findOne?.({ ...(options ?? {}), where: { id } })
        }

        async findAll(options?: object) {
            if (this.repository.findAndCount) {
                const [items, total] = await this.repository.findAndCount(options)
                return { items, total }
            }
            return { items: [], total: 0 }
        }

        async update(id: string, entity: Partial<T>) {
            return this.repository.update?.(id, entity)
        }

        async create(entity: Partial<T>) {
            return this.repository.save?.(entity)
        }

        async delete(where: object) {
            return this.repository.delete?.(where)
        }

        async save(entity: T | T[]) {
            return this.repository.save?.(entity)
        }
    }
}))

import { ConflictException, ForbiddenException } from '@nestjs/common'
import {
    DocumentSourceProviderCategoryEnum,
    DocumentTypeEnum,
    IKnowledgeDocument,
    IKnowledgeDocumentChunk,
    KBDocumentStatusEnum,
    KnowledgebaseTypeEnum
} from '@xpert-ai/contracts'
import { DataSource, Repository } from 'typeorm'
import { StorageFileService } from '@xpert-ai/server-core'
import { CommandBus } from '@nestjs/cqrs'
import { Queue } from 'bull'
import type { KnowledgebaseService, KnowledgeDocumentStore } from '../knowledgebase'
import type { KnowledgeWorkAreaResolver } from '../shared'
import { computeKnowledgeDocumentChunkHash, computeKnowledgeDocumentProcessingHash } from './document-hash'
import { KnowledgeDocument } from './document.entity'
import { buildLogicalFolderPath, KnowledgeDocumentService } from './document.service'
import { resolveKnowledgeDocumentParserConfig } from './parser-config'

function createService(
    documents: Partial<KnowledgeDocument>[],
    overrides?: {
        repo?: object
        knowledgebaseService?: object
        commandBus?: object
        dataSource?: object
    }
) {
    const repo = {
        findAndCount: jest.fn(async () => [documents, documents.length]),
        ...(overrides?.repo ?? {})
    } as unknown as Repository<KnowledgeDocument>

    const storageFileService = {
        findOne: jest.fn()
    } as unknown as StorageFileService
    const knowledgeWorkAreaResolver = {
        resolve: jest.fn(async () => ({
            volume: {
                path: (filePath: string) => `/knowledge-volume/${filePath}`
            }
        }))
    } as unknown as KnowledgeWorkAreaResolver
    const knowledgebaseService = {
        findReadableKnowledgebaseIds: jest.fn(async () => ['kb-1']),
        findOne: jest.fn(async (id: string) => ({ id })),
        assertKnowledgebaseWriteAccess: jest.fn(async (id: string) => ({ id })),
        assertNotRebuilding: jest.fn(),
        ...(overrides?.knowledgebaseService ?? {})
    }

    const service = new KnowledgeDocumentService(
        repo,
        (overrides?.dataSource ?? {}) as DataSource,
        storageFileService,
        knowledgeWorkAreaResolver,
        knowledgebaseService as unknown as KnowledgebaseService,
        (overrides?.commandBus ?? {}) as CommandBus,
        {} as Queue
    )
    Object.assign(service, {
        textSplitterRegistry: {
            get: jest.fn(() => null)
        }
    })
    return service
}

describe('KnowledgeDocumentService knowledgebase permissions', () => {
    it('filters document lists through the readable knowledgebase set', async () => {
        const findAndCount = jest.fn(async () => [[], 0])
        const findReadableKnowledgebaseIds = jest.fn(async () => ['kb-public', 'kb-organization'])
        const service = createService([], {
            repo: { findAndCount },
            knowledgebaseService: { findReadableKnowledgebaseIds }
        })

        await service.findAll({ where: { knowledgebaseId: 'kb-public' } })

        expect(findReadableKnowledgebaseIds).toHaveBeenCalled()
        expect(findAndCount).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    tenantId: 'tenant-1',
                    knowledgebaseId: expect.objectContaining({ _type: 'and' })
                })
            })
        )
    })

    it('propagates the owning knowledgebase write denial for document mutations', async () => {
        const denial = new ForbiddenException()
        const assertKnowledgebaseWriteAccess = jest.fn().mockRejectedValue(denial)
        const service = createService([], {
            repo: {
                findOne: jest.fn(async () => ({
                    id: 'doc-public',
                    tenantId: 'tenant-1',
                    organizationId: 'org-2',
                    knowledgebaseId: 'kb-public'
                }))
            },
            knowledgebaseService: {
                findOne: jest.fn(async () => ({ id: 'kb-public' })),
                assertKnowledgebaseWriteAccess
            }
        })

        await expect(service.assertDocumentWriteAccess('doc-public')).rejects.toBe(denial)
        expect(assertKnowledgebaseWriteAccess).toHaveBeenCalledWith('kb-public')
    })
})

describe('KnowledgeDocumentService logical folder paths', () => {
    it('orders ancestors from the root to the selected entity', async () => {
        const root = {
            id: 'folder-water',
            name: '水利',
            sourceType: DocumentTypeEnum.FOLDER
        } as KnowledgeDocument
        const child = {
            id: 'folder-east',
            name: '华东',
            sourceType: DocumentTypeEnum.FOLDER,
            parent: root
        } as KnowledgeDocument
        const document = {
            id: 'document-pdf',
            name: 'pricing.pdf',
            sourceType: DocumentTypeEnum.FILE,
            parent: child
        } as KnowledgeDocument
        const findAncestorsTree = jest.fn(async (entity: KnowledgeDocument) => entity)
        const service = createService([], {
            dataSource: {
                getTreeRepository: jest.fn(() => ({
                    findOneBy: jest.fn(async () => document),
                    findAncestorsTree
                }))
            }
        })

        await expect(service.findAncestors(document.id)).resolves.toEqual([root, child, document])
        expect(findAncestorsTree).toHaveBeenCalledWith(document)
    })

    it('builds a knowledgebase-relative path without the document id or leading slash', () => {
        const ancestors = [
            { id: 'folder-water', name: '水利', sourceType: DocumentTypeEnum.FOLDER },
            { id: 'folder-east', name: '华东', sourceType: DocumentTypeEnum.FOLDER },
            { id: 'document-pdf', name: 'pricing.pdf', sourceType: DocumentTypeEnum.FILE }
        ]

        expect(buildLogicalFolderPath(ancestors, 'document-pdf')).toBe('水利/华东')
        expect(buildLogicalFolderPath([ancestors[2]], 'document-pdf')).toBe('')
    })

    it('persists the logical parent folder when creating a document', async () => {
        const save = jest.fn(async (entity: Partial<KnowledgeDocument>) => ({ id: 'document-pdf', ...entity }))
        const service = createService([], { repo: { save } })
        jest.spyOn(service, 'findAncestors').mockResolvedValue([
            { id: 'folder-water', name: '水利', sourceType: DocumentTypeEnum.FOLDER } as KnowledgeDocument,
            { id: 'folder-east', name: '华东', sourceType: DocumentTypeEnum.FOLDER } as KnowledgeDocument,
            { id: 'document-pdf', name: 'pricing.pdf', sourceType: DocumentTypeEnum.FILE } as KnowledgeDocument
        ])

        const document = await service.create({
            knowledgebaseId: 'kb-1',
            name: 'pricing.pdf',
            sourceType: DocumentTypeEnum.FILE,
            type: 'pdf'
        })

        expect(document.folder).toBe('水利/华东')
        expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ folder: '水利/华东' }))
    })

    it('persists the parent path when a folder is created through the generic CRUD route', async () => {
        const save = jest.fn(async (entity: Partial<KnowledgeDocument>) => ({ id: 'folder-east', ...entity }))
        const service = createService([], { repo: { save } })
        jest.spyOn(service, 'findAncestors').mockResolvedValue([
            { id: 'folder-water', name: '水利', sourceType: DocumentTypeEnum.FOLDER } as KnowledgeDocument,
            { id: 'folder-east', name: '华东', sourceType: DocumentTypeEnum.FOLDER } as KnowledgeDocument
        ])

        const folder = await service.create({
            knowledgebaseId: 'kb-1',
            name: '华东',
            sourceType: DocumentTypeEnum.FOLDER
        })

        expect(folder.folder).toBe('水利')
        expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ folder: '水利' }))
    })
})

describe('KnowledgeDocumentService folder child counts', () => {
    it('returns direct document and child-folder counts, including empty folders', async () => {
        const getRawMany = jest.fn(async () => [{ folderId: 'folder-a', documentCount: '3', folderCount: '2' }])
        const queryBuilder = {
            innerJoin: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            addSelect: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            setParameter: jest.fn().mockReturnThis(),
            groupBy: jest.fn().mockReturnThis(),
            getRawMany
        }
        const service = createService(
            [
                { id: 'folder-a', knowledgebaseId: 'kb-1', sourceType: DocumentTypeEnum.FOLDER },
                { id: 'folder-empty', knowledgebaseId: 'kb-1', sourceType: DocumentTypeEnum.FOLDER }
            ],
            { repo: { createQueryBuilder: jest.fn(() => queryBuilder) } }
        )

        await expect(
            service.getFolderChildCounts({ knowledgebaseId: 'kb-1', folderIds: ['folder-a', 'folder-empty'] })
        ).resolves.toEqual([
            { folderId: 'folder-a', documentCount: 3, folderCount: 2 },
            { folderId: 'folder-empty', documentCount: 0, folderCount: 0 }
        ])
        expect(queryBuilder.andWhere).toHaveBeenCalledWith('parent.id IN (:...folderIds)', {
            folderIds: ['folder-a', 'folder-empty']
        })
    })
})

describe('KnowledgeDocumentService original file downloads', () => {
    it('selects uploaded workspace files with original file paths', async () => {
        const service = createService([
            {
                id: 'doc-workspace',
                knowledgebaseId: 'kb-1',
                sourceType: DocumentTypeEnum.FILE,
                name: 'DESIGN.md',
                filePath: 'files/DESIGN.md',
                mimeType: 'text/markdown'
            }
        ])

        await expect(service.getOriginalFileDownloadTargets(['doc-workspace'])).resolves.toEqual([
            expect.objectContaining({
                absolutePath: '/knowledge-volume/files/DESIGN.md',
                fileName: 'DESIGN.md',
                mimeType: 'text/markdown'
            })
        ])
    })

    it('excludes agent-written and non-file documents from original downloads', async () => {
        const service = createService([
            {
                id: 'doc-local',
                knowledgebaseId: 'kb-1',
                sourceType: DocumentTypeEnum.FILE,
                name: 'local.txt',
                filePath: 'files/local.txt'
            },
            {
                id: 'doc-agent',
                knowledgebaseId: 'kb-1',
                sourceType: DocumentTypeEnum.FILE,
                metadata: { systemManaged: true, systemManagedType: 'agent-writer' },
                name: 'agent.txt',
                filePath: 'files/agent.txt'
            },
            {
                id: 'doc-folder',
                sourceType: DocumentTypeEnum.FOLDER,
                name: 'folder',
                filePath: 'files/folder'
            },
            {
                id: 'doc-no-file',
                knowledgebaseId: 'kb-1',
                sourceType: DocumentTypeEnum.FILE
            }
        ])

        await expect(service.getOriginalFileDownloadTargets(['doc-local', 'doc-agent', 'doc-folder'])).resolves.toEqual(
            [
                expect.objectContaining({
                    absolutePath: '/knowledge-volume/files/local.txt',
                    fileName: 'local.txt'
                })
            ]
        )
    })

    it('deduplicates selected documents that reference the same original file path', async () => {
        const service = createService([
            {
                id: 'doc-1',
                knowledgebaseId: 'kb-1',
                sourceType: DocumentTypeEnum.FILE,
                name: 'shared.txt',
                filePath: 'files/shared.txt'
            },
            {
                id: 'doc-2',
                knowledgebaseId: 'kb-1',
                sourceType: DocumentTypeEnum.FILE,
                name: 'shared-copy.txt',
                filePath: 'files/shared.txt'
            }
        ])

        const targets = await service.getOriginalFileDownloadTargets(['doc-1', 'doc-2'])

        expect(targets).toHaveLength(1)
        expect(targets[0]).toEqual(
            expect.objectContaining({
                fileName: 'shared.txt',
                absolutePath: '/knowledge-volume/files/shared.txt'
            })
        )
    })
})

describe('KnowledgeDocumentService optimistic locks', () => {
    it('updates a document only when the expected version matches', async () => {
        const update = jest.fn(async () => ({ affected: 1, generatedMaps: [], raw: [] }))
        const assertNotRebuilding = jest.fn()
        const service = createService([], {
            repo: {
                findOne: jest.fn(async () => ({
                    id: 'doc-1',
                    version: 3,
                    knowledgebaseId: 'kb-1'
                })),
                update
            },
            knowledgebaseService: {
                assertNotRebuilding
            }
        })

        await expect(service.updateWithVersion('doc-1', { name: 'Updated', version: 3 }, 3)).resolves.toEqual(
            expect.objectContaining({
                affected: 1
            })
        )

        expect(assertNotRebuilding).toHaveBeenCalledWith('kb-1')
        expect(update).toHaveBeenCalledWith(
            { id: 'doc-1', version: 3 },
            expect.objectContaining({
                id: 'doc-1',
                name: 'Updated'
            })
        )
    })

    it('returns conflict when no document row matches the expected version', async () => {
        const service = createService([], {
            repo: {
                findOne: jest.fn(async () => ({
                    id: 'doc-1',
                    version: 3,
                    knowledgebaseId: 'kb-1'
                })),
                update: jest.fn(async () => ({ affected: 0, generatedMaps: [], raw: [] }))
            },
            knowledgebaseService: {
                assertNotRebuilding: jest.fn()
            }
        })

        await expect(service.updateWithVersion('doc-1', { name: 'Updated', version: 3 }, 3)).rejects.toBeInstanceOf(
            ConflictException
        )
    })

    it('does not delete vectors or graph data when a delete version conflict is detected before cleanup', async () => {
        const deleteDocumentRow = jest.fn()
        const deleteKnowledgeDocument = jest.fn()
        const clearGraph = jest.fn()
        const updateKnowledgebase = jest.fn()
        const service = createService([], {
            repo: {
                findOne: jest.fn(async () => ({
                    id: 'doc-1',
                    version: 4,
                    knowledgebaseId: 'kb-1',
                    knowledgebase: {
                        id: 'kb-1',
                        documentNum: 1,
                        documents: [{ id: 'doc-1' }]
                    }
                })),
                delete: deleteDocumentRow
            },
            knowledgebaseService: {
                assertNotRebuilding: jest.fn(),
                getActiveVectorStore: jest.fn(
                    async () =>
                        ({
                            deleteKnowledgeDocument
                        }) as unknown as KnowledgeDocumentStore
                ),
                updateKnowledgebase
            },
            commandBus: {
                execute: clearGraph
            }
        })

        await expect(service.deleteWithVersion('doc-1', 3)).rejects.toBeInstanceOf(ConflictException)

        expect(deleteDocumentRow).not.toHaveBeenCalled()
        expect(deleteKnowledgeDocument).not.toHaveBeenCalled()
        expect(clearGraph).not.toHaveBeenCalled()
        expect(updateKnowledgebase).not.toHaveBeenCalled()
    })

    it('does not delete the versioned document row when vector cleanup fails', async () => {
        const deleteDocumentRow = jest.fn(async () => ({ affected: 1, raw: [] }))
        const deleteKnowledgeDocument = jest.fn(async () => {
            throw new Error('vector cleanup failed')
        })
        const updateKnowledgebase = jest.fn()
        const service = createService([], {
            repo: {
                findOne: jest.fn(async () => ({
                    id: 'doc-1',
                    version: 3,
                    sourceType: DocumentTypeEnum.FILE,
                    knowledgebaseId: 'kb-1',
                    knowledgebase: {
                        id: 'kb-1',
                        documentNum: 1,
                        documents: [{ id: 'doc-1', sourceType: DocumentTypeEnum.FILE }]
                    }
                })),
                delete: deleteDocumentRow
            },
            knowledgebaseService: {
                assertNotRebuilding: jest.fn(),
                getActiveVectorStore: jest.fn(
                    async () =>
                        ({
                            deleteKnowledgeDocument
                        }) as unknown as KnowledgeDocumentStore
                ),
                updateKnowledgebase
            },
            commandBus: {
                execute: jest.fn()
            }
        })

        await expect(service.deleteWithVersion('doc-1', 3)).rejects.toThrow('vector cleanup failed')

        expect(deleteKnowledgeDocument).toHaveBeenCalled()
        expect(deleteDocumentRow).not.toHaveBeenCalled()
        expect(updateKnowledgebase).not.toHaveBeenCalled()
    })
})

describe('KnowledgeDocumentService incremental ingestion', () => {
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

    it('returns chunk-level incremental sync statistics', async () => {
        const unchangedIncoming = {
            pageContent: 'same content',
            metadata: { chunkId: 'chunk-a', chunkIndex: 0 }
        } as IKnowledgeDocumentChunk
        const changedIncoming = {
            pageContent: 'new content',
            metadata: { chunkId: 'chunk-b-new', chunkIndex: 1 }
        } as IKnowledgeDocumentChunk
        const addedIncoming = {
            pageContent: 'added content',
            metadata: { chunkId: 'chunk-c', chunkIndex: 2 }
        } as IKnowledgeDocumentChunk
        const unchangedExisting = {
            id: 'row-a',
            ...unchangedIncoming,
            contentHash: computeKnowledgeDocumentChunkHash(unchangedIncoming)
        } as IKnowledgeDocumentChunk
        const changedExisting = {
            id: 'row-b',
            pageContent: 'old content',
            metadata: { chunkId: 'chunk-b-old', chunkIndex: 1 },
            contentHash: computeKnowledgeDocumentChunkHash({
                pageContent: 'old content',
                metadata: { chunkId: 'chunk-b-old', chunkIndex: 1 }
            } as IKnowledgeDocumentChunk)
        } as IKnowledgeDocumentChunk
        const deletedExisting = {
            id: 'row-deleted',
            pageContent: 'deleted content',
            metadata: { chunkId: 'chunk-deleted', chunkIndex: 3 },
            contentHash: computeKnowledgeDocumentChunkHash({
                pageContent: 'deleted content',
                metadata: { chunkId: 'chunk-deleted', chunkIndex: 3 }
            } as IKnowledgeDocumentChunk)
        } as IKnowledgeDocumentChunk
        const service = createService([])
        Object.assign(service, {
            chunkService: {
                findAll: jest.fn(async () => ({
                    items: [unchangedExisting, changedExisting, deletedExisting]
                })),
                upsertBulk: jest.fn(async (chunks: IKnowledgeDocumentChunk[]) =>
                    chunks.map((chunk) => ({
                        ...chunk,
                        id: chunk.id ?? `row-${chunk.metadata?.chunkId}`
                    }))
                ),
                delete: jest.fn(),
                findAllEmbeddingNodes: jest.fn((chunks: IKnowledgeDocumentChunk[]) => chunks)
            }
        })
        const vectorStore = {
            deleteChunks: jest.fn()
        } as unknown as KnowledgeDocumentStore

        const result = await service.syncChunksIncrementally(
            {
                id: 'doc-1',
                knowledgebaseId: 'kb-1',
                contentHash: 'old-content-hash',
                chunks: [unchangedIncoming, changedIncoming, addedIncoming]
            } as IKnowledgeDocument,
            vectorStore
        )

        expect(result.statistics).toEqual({
            total: 3,
            skipped: 1,
            added: 1,
            updated: 1,
            deleted: 1
        })
    })

    it('adds stored chunk versions to vector search results', async () => {
        const vectorStore = {
            getChunks: jest.fn(async () => ({
                items: [
                    {
                        pageContent: 'matched chunk',
                        metadata: {
                            chunkId: 'chunk-1'
                        }
                    }
                ],
                total: 1
            }))
        }
        const service = createService([], {
            knowledgebaseService: {
                getActiveVectorStore: jest.fn(async () => vectorStore)
            }
        })
        jest.spyOn(service, 'findOne').mockResolvedValue({
            id: 'doc-1',
            knowledgebase: {}
        } as KnowledgeDocument)
        Object.assign(service, {
            chunkService: {
                findAll: jest.fn(async () => ({
                    items: [
                        {
                            id: 'chunk-1',
                            version: 7,
                            contentHash: 'chunk-content-hash'
                        }
                    ]
                }))
            }
        })

        const result = await service.getChunks('doc-1', {
            search: 'matched',
            skip: 0,
            take: 20
        })

        expect(result.items[0]).toEqual(
            expect.objectContaining({
                id: 'chunk-1',
                version: 7,
                contentHash: 'chunk-content-hash'
            })
        )
    })

    it('returns stored document chunks in chunkIndex order when not searching', async () => {
        const service = createService([])
        const findAll = jest.fn(async () => ({
            items: [
                {
                    id: 'chunk-2',
                    pageContent: 'second',
                    metadata: { chunkId: 'chunk-2', chunkIndex: 1 }
                },
                {
                    id: 'chunk-1',
                    pageContent: 'first',
                    metadata: { chunkId: 'chunk-1', chunkIndex: 0 }
                }
            ],
            total: 2
        }))
        Object.assign(service, {
            chunkService: {
                findAll
            }
        })

        const result = await service.getChunks('doc-1', {
            skip: 0,
            take: 20
        } as any)

        expect(findAll).toHaveBeenCalledWith(
            expect.objectContaining({
                order: { createdAt: 'ASC' }
            })
        )
        expect(result.items.map((chunk) => chunk.id)).toEqual(['chunk-1', 'chunk-2'])
    })

    it('includes an exact evidence chunk outside the current document page', async () => {
        const service = createService([])
        const findAll = jest
            .fn()
            .mockResolvedValueOnce({
                items: [{ id: 'chunk-1', pageContent: 'first page chunk', metadata: { chunkIndex: 0 } }],
                total: 25
            })
            .mockResolvedValueOnce({
                items: [
                    {
                        id: 'row-25',
                        pageContent: 'exact cited evidence',
                        metadata: { chunkId: 'evidence-chunk-25', chunkIndex: 24 }
                    }
                ],
                total: 1
            })
        Object.assign(service, { chunkService: { findAll } })

        const result = await service.getChunks('doc-1', {
            skip: 0,
            take: 20,
            targetChunkId: 'evidence-chunk-25'
        })

        expect(result.total).toBe(25)
        expect(result.items.map((chunk) => chunk.metadata?.chunkId ?? chunk.id)).toEqual([
            'evidence-chunk-25',
            'chunk-1'
        ])
        expect(findAll).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                take: 1,
                skip: 0,
                where: expect.any(Array)
            })
        )
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
