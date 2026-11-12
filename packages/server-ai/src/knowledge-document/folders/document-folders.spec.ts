import { createService } from '../testing/document-service.fixture'
import { Knowledgebase } from '../../knowledgebase/persistence/knowledgebase.entity'
import { environment } from '@xpert-ai/server-config'
import { ConflictException } from '@nestjs/common'
import { DocumentTypeEnum, IKnowledgeDocument, VectorTypeEnum } from '@xpert-ai/contracts'
import { KnowledgeDocument } from '../document.entity'
import { buildLogicalFolderPath } from '../document.service'

describe('KnowledgeDocumentService per-knowledgebase vector synchronization', () => {
    it('synchronizes only Milvus documents when the global backend is PGVector', async () => {
        const previous = environment.vectorStore
        environment.vectorStore = VectorTypeEnum.PGVECTOR
        try {
            const documents: Partial<KnowledgeDocument>[] = [
                {
                    id: 'milvus-doc',
                    knowledgebaseId: 'milvus-kb',
                    knowledgebase: Object.assign(new Knowledgebase(), { vectorStore: VectorTypeEnum.MILVUS })
                },
                {
                    id: 'pg-doc',
                    knowledgebaseId: 'pg-kb',
                    knowledgebase: Object.assign(new Knowledgebase(), { vectorStore: VectorTypeEnum.PGVECTOR })
                }
            ]
            const partialUpdateFilterAttributes = jest.fn()
            const getActiveVectorStore = jest.fn(async () => ({ partialUpdateFilterAttributes }))
            const service = createService(documents, { knowledgebaseService: { getActiveVectorStore } })
            const chunk = { id: 'chunk', documentId: 'milvus-doc' }
            Object.assign(service.chunkMocks, { findAll: jest.fn(async () => ({ items: [chunk] })) })
            await service['editing'].syncMilvusFilterAttributes(['milvus-doc', 'pg-doc'])
            expect(getActiveVectorStore).toHaveBeenCalledTimes(1)
            expect(getActiveVectorStore).toHaveBeenCalledWith('milvus-kb', true)
            expect(partialUpdateFilterAttributes).toHaveBeenCalledWith(documents[0], [chunk])
        } finally {
            environment.vectorStore = previous
        }
    })
})

describe('KnowledgeDocumentService logical folder paths', () => {
    it('does not require a removed parser when only changing chunk settings', async () => {
        const parserConfig = {
            transformerType: 'removed-parser',
            transformerIntegration: 'old-connection',
            transformer: { mode: 'layout' },
            chunkSize: 500
        }
        const service = createService([], {
            repo: {
                update: jest.fn(async () => ({ affected: 1 })),
                findOne: jest.fn(async () => ({
                    id: 'doc',
                    knowledgebaseId: 'kb',
                    type: 'pdf',
                    version: 1,
                    parserConfig
                }))
            },
            knowledgebaseService: { assertNotRebuilding: jest.fn() }
        })
        const validateDocument = jest.fn(async () => {
            throw new Error('Parser is unavailable')
        })
        Object.assign(service.parserMocks, { validateDocument })
        await service.updateWithVersion('doc', { parserConfig: { ...parserConfig, chunkSize: 800 } }, 1)
        expect(validateDocument).not.toHaveBeenCalled()
        await expect(
            service.updateWithVersion(
                'doc',
                { parserConfig: { ...parserConfig, transformerType: 'different-parser' } },
                1
            )
        ).rejects.toThrow('Parser is unavailable')
    })

    it('does not let a document edit restore a stale publication epoch', async () => {
        const update = jest.fn(async (_criteria: object, _patch: Partial<IKnowledgeDocument>) => ({ affected: 1 }))
        const service = createService([], {
            repo: {
                update,
                findOne: jest.fn(async () => ({ id: 'doc', knowledgebaseId: 'kb', version: 1, publicationEpoch: 8 }))
            },
            knowledgebaseService: { assertNotRebuilding: jest.fn() }
        })
        await service.updateWithVersion('doc', { publicationEpoch: 0 }, 1)
        expect(update).toHaveBeenCalled()
        expect(update.mock.calls[0][1]).not.toHaveProperty('publicationEpoch')
    })

    it.each(['create', 'update', 'updateWithVersion', 'delete', 'deleteWithVersion'])(
        'advances the publication epoch together with the content hash after a chunk %s',
        async (operation) => {
            const update = jest.fn()
            const service = createService([], { repo: { update } })
            const chunk = {
                id: 'chunk',
                documentId: 'doc',
                pageContent: 'content',
                metadata: { chunkId: 'chunk' },
                version: 1
            }
            const chunks = {
                create: jest.fn(async () => chunk),
                findOne: jest.fn(async () => chunk),
                findAll: jest.fn(async () => ({ items: operation.startsWith('delete') ? [] : [chunk] })),
                updateChunk: jest.fn(),
                updateWithVersion: jest.fn(),
                delete: jest.fn(),
                deleteWithVersion: jest.fn()
            }
            Object.assign(service.chunkMocks, chunks)
            jest.spyOn(service, 'getDocumentVectorStore').mockResolvedValue({
                document: { id: 'doc', knowledgebaseId: 'kb', knowledgebase: { id: 'kb' } },
                vectorStore: {
                    addKnowledgeDocument: jest.fn(),
                    updateChunk: jest.fn(),
                    partialUpdateFilterAttributes: jest.fn(),
                    deleteChunk: jest.fn(),
                    deleteChunks: jest.fn()
                }
            } as never)
            if (operation === 'create') await service.createChunk('doc', chunk)
            else if (operation === 'update') await service.updateChunk('doc', 'chunk', chunk)
            else if (operation === 'updateWithVersion') await service.updateChunkWithVersion('doc', 'chunk', chunk)
            else if (operation === 'delete') await service.deleteChunk('doc', 'chunk')
            else await service.deleteChunkWithVersion('doc', 'chunk', 1)
            expect(update).toHaveBeenCalledWith(
                'doc',
                expect.objectContaining({
                    contentHash: expect.any(String),
                    publicationEpoch: expect.any(Function)
                })
            )
        }
    )

    it('keeps soft deletion closed until every derived-data participant is fail-closed', async () => {
        const service = createService([])

        await expect(service.softRemove('document-1')).rejects.toBeInstanceOf(ConflictException)
    })

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
        expect(queryBuilder.andWhere).toHaveBeenCalledWith(expect.stringContaining('systemManagedType'))
        expect(queryBuilder.andWhere).toHaveBeenCalledWith('parent.id IN (:...folderIds)', {
            folderIds: ['folder-a', 'folder-empty']
        })
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
})
