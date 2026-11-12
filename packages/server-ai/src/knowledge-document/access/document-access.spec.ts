import { createService } from '../testing/document-service.fixture'
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { DocumentTypeEnum, IKnowledgeDocument } from '@xpert-ai/contracts'
import { GetOwnedStorageFileQuery } from '../../file-understanding/queries'

describe('KnowledgeDocumentService access boundaries', () => {
    it('authorizes a document through its parent knowledgebase', async () => {
        const findOneByIdString = jest.fn().mockResolvedValue({ id: 'kb-owner' })
        const service = createService([], {
            repo: {
                findOne: jest.fn().mockResolvedValue({ id: 'doc-1', knowledgebaseId: 'kb-owner' })
            },
            knowledgebaseService: { findOneByIdString }
        })

        await expect(service.assertDocumentReadAccess('doc-1')).resolves.toBeUndefined()
        expect(findOneByIdString).toHaveBeenCalledWith('kb-owner', { select: { id: true } })
    })

    it('propagates a victim knowledgebase rejection before reading document content', async () => {
        const findOneByIdString = jest.fn().mockRejectedValue(new ForbiddenException())
        const service = createService([], {
            repo: {
                findOne: jest.fn().mockResolvedValue({ id: 'doc-victim', knowledgebaseId: 'kb-victim' })
            },
            knowledgebaseService: { findOneByIdString }
        })

        await expect(service.assertDocumentReadAccess('doc-victim')).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('rejects a document id that is outside the route knowledgebase', async () => {
        const service = createService([], {
            repo: {
                findAndCount: jest.fn().mockResolvedValue([[], 0])
            },
            knowledgebaseService: {
                assertKnowledgebaseWriteAccess: jest.fn()
            }
        })

        await expect(
            service.assertDocumentsWriteAccessInKnowledgebase(['doc-victim'], 'kb-owner')
        ).rejects.toBeInstanceOf(NotFoundException)
    })

    it('authorizes the route knowledgebase even when no document ids are supplied', async () => {
        const assertKnowledgebaseWriteAccess = jest.fn()
        const service = createService([], {
            knowledgebaseService: { assertKnowledgebaseWriteAccess }
        })

        await service.assertDocumentsWriteAccessInKnowledgebase([], 'kb-owner')

        expect(assertKnowledgebaseWriteAccess).toHaveBeenCalledWith('kb-owner', { select: { id: true } })
    })

    it('resolves StorageFile handles through the owner-authorized query', async () => {
        const execute = jest.fn().mockResolvedValue({ id: 'storage-1' })
        const service = createService([], { queryBus: { execute } })

        await service.assertOwnedStorageFiles(['storage-1'])

        expect(execute).toHaveBeenCalledWith(expect.any(GetOwnedStorageFileQuery))
        expect((execute.mock.calls[0][0] as GetOwnedStorageFileQuery).storageFileId).toBe('storage-1')
    })

    it('rejects a client-supplied remote file URL without an owned StorageFile', async () => {
        const service = createService([])

        await expect(
            service.prepareExternalDocumentInputs([{ fileUrl: 'http://127.0.0.1/internal' }])
        ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('replaces a client file URL with the canonical managed file URL', async () => {
        const readFile = jest.fn().mockResolvedValue({
            filePath: 'reports/summary.pdf',
            fileUrl: 'https://files.example.test/reports/summary.pdf'
        })
        const service = createService([], {
            knowledgeWorkAreaResolver: {
                resolve: jest.fn(async () => ({ volume: { readFile } }))
            }
        })
        const document = {
            knowledgebaseId: 'kb-owner',
            filePath: 'files/reports/summary.pdf',
            fileUrl: 'http://127.0.0.1/internal'
        }

        await service.prepareExternalDocumentInputs([document])

        expect(readFile).toHaveBeenCalledWith('files', 'reports/summary.pdf', { metadataOnly: true })
        expect(document.fileUrl).toBe('https://files.example.test/reports/summary.pdf')
    })

    it('replaces a client file URL with the canonical owned StorageFile URL', async () => {
        const execute = jest.fn().mockResolvedValue({
            id: 'storage-1',
            fileUrl: 'https://storage.example.test/owner-file.pdf'
        })
        const service = createService([], { queryBus: { execute } })
        const document = {
            storageFileId: 'storage-1',
            fileUrl: 'http://127.0.0.1/internal',
            filePath: 'users/victim/staging/private.pdf'
        }

        await service.prepareExternalDocumentInputs([document])

        expect(document.fileUrl).toBe('https://storage.example.test/owner-file.pdf')
        expect(document.filePath).toBeUndefined()
        expect(execute).toHaveBeenCalledWith(expect.any(GetOwnedStorageFileQuery))
    })

    it('rejects a managed filePath outside the knowledgebase files subtree', async () => {
        const service = createService([])

        await expect(
            service.prepareExternalDocumentInputs([
                { knowledgebaseId: 'kb-owner', filePath: 'users/victim/staging/private.pdf' }
            ])
        ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('canonicalizes an existing file from the knowledgebase files subtree', async () => {
        const readFile = jest.fn().mockResolvedValue({
            filePath: 'reports/summary.pdf',
            fileUrl: 'https://files.example.test/reports/summary.pdf',
            mimeType: 'application/pdf',
            size: 42
        })
        const service = createService([], {
            knowledgeWorkAreaResolver: {
                resolve: jest.fn(async () => ({ volume: { readFile } }))
            }
        })
        const document = { knowledgebaseId: 'kb-owner', filePath: 'files/reports/summary.pdf' }

        await service.prepareExternalDocumentInputs([document])

        expect(readFile).toHaveBeenCalledWith('files', 'reports/summary.pdf', { metadataOnly: true })
        expect(document).toEqual(
            expect.objectContaining({
                filePath: 'files/reports/summary.pdf',
                fileUrl: 'https://files.example.test/reports/summary.pdf',
                mimeType: 'application/pdf',
                size: '42'
            })
        )
    })

    it('does not use a client-supplied document id to select the knowledgebase for create input', async () => {
        const readFile = jest.fn().mockResolvedValue({ filePath: 'reports/summary.pdf' })
        const resolve = jest.fn(async () => ({ volume: { readFile } }))
        const findOne = jest.fn().mockResolvedValue({ id: 'victim-doc', knowledgebaseId: 'victim-kb' })
        const service = createService([], {
            repo: { findOne },
            knowledgeWorkAreaResolver: { resolve }
        })

        await service.prepareExternalDocumentInputs([
            { id: 'victim-doc', knowledgebaseId: 'owner-kb', filePath: 'files/reports/summary.pdf' }
        ])

        expect(findOne).not.toHaveBeenCalled()
        expect(resolve).toHaveBeenCalledWith(
            expect.objectContaining({ knowledgebaseId: 'owner-kb', userId: 'user-1', tenantId: 'tenant-1' })
        )
    })

    it('rejects a page that does not belong to the route document', async () => {
        const service = createService([], {
            repo: {
                findOne: jest.fn().mockResolvedValue({
                    id: 'doc-1',
                    knowledgebaseId: 'kb-1',
                    pages: [],
                    knowledgebase: {}
                })
            }
        })

        await expect(service.deletePage('doc-1', 'page-victim')).rejects.toBeInstanceOf(NotFoundException)
    })

    it('rejects a chunk that does not belong to the route document before deletion', async () => {
        const deleteWithVersion = jest.fn()
        const vectorStore = { deleteChunk: jest.fn() }
        const service = createService([])
        Object.assign(service.chunkMocks, {
            findOne: jest.fn().mockResolvedValue({ id: 'chunk-victim', documentId: 'doc-victim' }),
            deleteWithVersion
        })
        jest.spyOn(service, 'getDocumentVectorStore').mockResolvedValue({ vectorStore } as never)

        await expect(service.deleteChunkWithVersion('doc-owner', 'chunk-victim', 1)).rejects.toBeInstanceOf(
            NotFoundException
        )
        expect(deleteWithVersion).not.toHaveBeenCalled()
        expect(vectorStore.deleteChunk).not.toHaveBeenCalled()
    })

    it('rejects a create parent outside the selected knowledgebase before persistence', async () => {
        const save = jest.fn()
        const service = createService([], {
            repo: {
                findOne: jest.fn().mockResolvedValue({
                    id: 'folder-victim',
                    knowledgebaseId: 'kb-victim',
                    sourceType: DocumentTypeEnum.FOLDER
                }),
                save
            }
        })

        await expect(
            service.create({
                knowledgebaseId: 'kb-owner',
                parent: { id: 'folder-victim' } as IKnowledgeDocument,
                sourceType: DocumentTypeEnum.FILE
            })
        ).rejects.toBeInstanceOf(BadRequestException)
        expect(save).not.toHaveBeenCalled()
    })

    it('drops client-controlled identity and scope fields before creating a document', async () => {
        const save = jest.fn(async (entity: Partial<IKnowledgeDocument>) => ({ ...entity, id: 'doc-generated' }))
        const service = createService([], { repo: { save } })
        jest.spyOn(service, 'findAncestors').mockResolvedValue([])

        await service.create({
            id: 'doc-victim',
            knowledgebaseId: 'kb-owner',
            createdById: 'victim-user',
            updatedById: 'victim-user',
            tenantId: 'victim-tenant',
            organizationId: 'victim-org',
            sourceType: DocumentTypeEnum.FILE
        })

        const persisted = save.mock.calls[0][0]
        expect(persisted).not.toHaveProperty('id')
        expect(persisted).not.toHaveProperty('createdById')
        expect(persisted).not.toHaveProperty('updatedById')
        expect(persisted).not.toHaveProperty('tenantId')
        expect(persisted).not.toHaveProperty('organizationId')
    })

    it('rejects a non-folder update parent before the repository transaction', async () => {
        const transaction = jest.fn()
        const service = createService([], {
            repo: {
                findOne: jest.fn(async (options: { where?: { id?: string } }) =>
                    options.where?.id === 'doc-owner'
                        ? {
                              id: 'doc-owner',
                              version: 3,
                              knowledgebaseId: 'kb-owner',
                              parent: null
                          }
                        : {
                              id: 'doc-victim-parent',
                              knowledgebaseId: 'kb-owner',
                              sourceType: DocumentTypeEnum.FILE
                          }
                )
            },
            dataSource: { transaction },
            knowledgebaseService: { assertNotRebuilding: jest.fn() }
        })

        await expect(
            service.updateWithVersion('doc-owner', { parent: { id: 'doc-victim-parent' } as IKnowledgeDocument }, 3)
        ).rejects.toBeInstanceOf(BadRequestException)
        expect(transaction).not.toHaveBeenCalled()
    })

    it('rejects moving a document to another knowledgebase before the repository transaction', async () => {
        const transaction = jest.fn()
        const service = createService([], {
            repo: {
                findOne: jest.fn().mockResolvedValue({
                    id: 'doc-owner',
                    version: 3,
                    knowledgebaseId: 'kb-owner',
                    parent: null
                })
            },
            dataSource: { transaction },
            knowledgebaseService: { assertNotRebuilding: jest.fn() }
        })

        await expect(
            service.updateWithVersion('doc-owner', { knowledgebaseId: 'kb-victim' }, 3)
        ).rejects.toBeInstanceOf(BadRequestException)
        expect(transaction).not.toHaveBeenCalled()
    })

    it('drops client-controlled identity and scope fields from document updates', async () => {
        const update = jest.fn().mockResolvedValue({ affected: 1 })
        const service = createService([], {
            repo: {
                findOne: jest.fn().mockResolvedValue({
                    id: 'doc-owner',
                    version: 3,
                    knowledgebaseId: 'kb-owner',
                    parent: null,
                    sourceType: DocumentTypeEnum.FILE
                })
            },
            dataSource: {
                transaction: jest.fn(async (callback: (manager: object) => Promise<unknown>) =>
                    callback({
                        getRepository: () => ({ update }),
                        query: jest.fn()
                    })
                )
            },
            knowledgebaseService: { assertNotRebuilding: jest.fn() }
        })

        await service.updateWithVersion(
            'doc-owner',
            {
                name: 'safe-name',
                tenantId: 'victim-tenant',
                organizationId: 'victim-org',
                createdById: 'victim-user',
                updatedById: 'victim-user'
            },
            3
        )

        const patch = update.mock.calls[0][1]
        expect(patch).toEqual(expect.objectContaining({ name: 'safe-name', updatedById: 'user-1' }))
        expect(patch).not.toHaveProperty('tenantId')
        expect(patch).not.toHaveProperty('organizationId')
        expect(patch).not.toHaveProperty('createdById')
    })
})
