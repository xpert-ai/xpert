import { createService } from '../testing/document-service.fixture'
import { Knowledgebase } from '../../knowledgebase/persistence/knowledgebase.entity'
import { ConflictException, ForbiddenException } from '@nestjs/common'
import { DocumentTypeEnum } from '@xpert-ai/contracts'
import type { KnowledgeDocumentStore } from '../../knowledgebase'
import { KnowledgeDocument } from '../document.entity'

describe('KnowledgeDocumentService optimistic locks', () => {
    it.each([false, true])(
        'updates only the derived counter after an authorized document delete (versioned: %s)',
        async (versioned) => {
            const updateCounter = jest.fn().mockResolvedValue({ affected: 1 })
            const updateKnowledgebase = jest
                .fn()
                .mockRejectedValue(new ForbiddenException('Configuration management denied'))
            const document = Object.assign(new KnowledgeDocument(), {
                id: 'doc-1',
                version: 3,
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                knowledgebaseId: 'kb-1',
                sourceType: DocumentTypeEnum.FILE,
                knowledgebase: Object.assign(new Knowledgebase(), {
                    id: 'kb-1',
                    organizationId: 'org-1',
                    documentNum: 2,
                    documents: [
                        { id: 'doc-1', sourceType: DocumentTypeEnum.FILE },
                        { id: 'doc-2', sourceType: DocumentTypeEnum.FILE }
                    ]
                })
            })
            const deleteRow = jest.fn().mockResolvedValue({ affected: 1 })
            const service = createService([], {
                repo: { findOne: jest.fn().mockResolvedValue(document), delete: deleteRow },
                dataSource: {
                    transaction: (_level, run) =>
                        run({
                            getRepository: (entity) =>
                                entity === Knowledgebase
                                    ? {
                                          findOneOrFail: jest.fn().mockResolvedValue({ id: 'kb-1' }),
                                          update: updateCounter
                                      }
                                    : { delete: deleteRow, countBy: jest.fn().mockResolvedValue(1) }
                        })
                },
                knowledgebaseService: {
                    assertNotRebuilding: jest.fn(),
                    getActiveVectorStore: jest.fn().mockResolvedValue({ deleteKnowledgeDocument: jest.fn() }),
                    updateKnowledgebase
                },
                commandBus: { execute: jest.fn() }
            })

            await expect(
                versioned ? service.deleteWithVersion('doc-1', 3) : service.delete('doc-1')
            ).resolves.toMatchObject({ affected: 1 })
            expect(deleteRow).toHaveBeenCalledTimes(1)
            expect(updateCounter).toHaveBeenCalledWith(
                { id: 'kb-1', tenantId: 'tenant-1', organizationId: 'org-1' },
                { documentNum: 1 }
            )
            expect(updateKnowledgebase).not.toHaveBeenCalled()
        }
    )

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
