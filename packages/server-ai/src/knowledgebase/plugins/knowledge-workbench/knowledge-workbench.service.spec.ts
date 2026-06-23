import { DocumentInterface } from '@langchain/core/documents'
import { DocumentTypeEnum, KnowledgeGraphStatus } from '@xpert-ai/contracts'
import { QueryBus } from '@nestjs/cqrs'
import { KnowledgeWorkbenchService } from './knowledge-workbench.service'

describe('KnowledgeWorkbenchService', () => {
    it('lists scoped root documents as workbench rows', async () => {
        const { service, documentService } = createService()

        const result = await service.listDocuments({
            allowedKnowledgebaseIds: ['kb-1'],
            knowledgebaseId: 'kb-1',
            page: 1,
            pageSize: 20
        })

        expect(documentService.findAll).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    knowledgebaseId: 'kb-1'
                }),
                skip: 0,
                take: 20
            })
        )
        expect(result).toEqual({
            items: [
                expect.objectContaining({
                    id: 'folder-1',
                    isFolder: true
                }),
                expect.objectContaining({
                    id: 'doc-1',
                    isFolder: false,
                    fileUrl: 'https://files.local/doc-1.pdf'
                })
            ],
            total: 2,
            breadcrumb: []
        })
    })

    it('searches selected documents and returns normalized citations', async () => {
        const { service, documentService, queryBus } = createService()
        documentService.findAll.mockResolvedValueOnce({
            items: [
                {
                    id: 'doc-1',
                    knowledgebaseId: 'kb-1',
                    sourceType: 'local-file',
                    type: 'pdf',
                    name: '质量手册.pdf',
                    fileUrl: 'https://files.local/doc-1.pdf'
                }
            ],
            total: 1
        })
        queryBus.execute.mockResolvedValueOnce([
            {
                pageContent: '质量控制内容',
                metadata: {
                    chunkId: 'chunk-1',
                    documentId: 'doc-1',
                    score: 0.89,
                    relevanceScore: 0.93
                },
                document: {
                    id: 'doc-1',
                    name: '质量手册.pdf',
                    fileUrl: 'https://files.local/doc-1.pdf'
                }
            } as DocumentInterface
        ])

        const result = await service.searchDocuments({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            allowedKnowledgebaseIds: ['kb-1'],
            knowledgebaseId: 'kb-1',
            query: '质量',
            documentIds: ['doc-1'],
            topK: 3
        })

        expect(queryBus.execute).toHaveBeenCalledWith(
            expect.objectContaining({
                input: expect.objectContaining({
                    tenantId: 'tenant-1',
                    organizationId: 'org-1',
                    knowledgebases: ['kb-1'],
                    filter: {
                        documentId: 'doc-1'
                    },
                    k: 3
                })
            })
        )
        expect(result.citations).toEqual([
            expect.objectContaining({
                chunkId: 'chunk-1',
                documentId: 'doc-1',
                documentName: '质量手册.pdf',
                fileUrl: 'https://files.local/doc-1.pdf',
                snippet: '质量控制内容'
            })
        ])
    })

    it('rejects document scoped search when a selected document is outside the connected knowledgebase', async () => {
        const { service, documentService } = createService()
        documentService.findAll.mockResolvedValueOnce({
            items: [],
            total: 0
        })

        await expect(
            service.searchDocuments({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                allowedKnowledgebaseIds: ['kb-1'],
                knowledgebaseId: 'kb-1',
                query: '质量',
                documentIds: ['doc-x']
            })
        ).rejects.toThrow("Document 'doc-x' is not available in the selected knowledgebase")
    })

    it('loads graph summary for a connected graph-enabled knowledgebase', async () => {
        const { service, knowledgebaseService, queryBus } = createService()
        knowledgebaseService.findAll.mockResolvedValueOnce({
            items: [
                {
                    id: 'kb-1',
                    name: '制造知识库',
                    graphRag: { enabled: true },
                    graphStatus: KnowledgeGraphStatus.READY,
                    graphRevision: 2
                } as any
            ],
            total: 1
        })
        queryBus.execute.mockResolvedValueOnce({
            status: {
                enabled: true,
                status: KnowledgeGraphStatus.READY,
                revision: 2,
                error: null,
                entityCount: 2,
                relationCount: 1,
                mentionCount: 5
            },
            visualization: {
                nodes: [
                    { id: 'entity-1', name: 'MES', type: 'system', origin: 'extracted', visibility: 'active' },
                    { id: 'entity-2', name: '工单', type: 'concept', origin: 'extracted', visibility: 'active' }
                ],
                edges: [
                    {
                        id: 'relation-1',
                        source: 'entity-1',
                        target: 'entity-2',
                        type: 'manages',
                        origin: 'extracted',
                        visibility: 'active'
                    }
                ],
                entityTypes: ['concept', 'system'],
                relationTypes: ['manages'],
                totalNodes: 2,
                totalEdges: 1
            }
        })

        const result = await service.getGraphSummary({
            allowedKnowledgebaseIds: ['kb-1'],
            knowledgebaseId: 'kb-1',
            search: 'MES',
            take: 20
        })

        expect(queryBus.execute).toHaveBeenCalledWith(
            expect.objectContaining({
                input: expect.objectContaining({
                    knowledgebaseId: 'kb-1',
                    query: expect.objectContaining({
                        search: 'MES',
                        take: 20
                    })
                })
            })
        )
        expect(result).toEqual(
            expect.objectContaining({
                enabled: true,
                status: KnowledgeGraphStatus.READY,
                entityCount: 2,
                relationCount: 1,
                nodes: expect.arrayContaining([expect.objectContaining({ id: 'entity-1' })]),
                edges: expect.arrayContaining([expect.objectContaining({ id: 'relation-1' })])
            })
        )
    })
})

function createService() {
    const knowledgebaseService = {
        assertNotRebuilding: jest.fn(async () => undefined),
        findAll: jest.fn(async () => ({
            items: [
                {
                    id: 'kb-1',
                    name: '制造知识库'
                }
            ],
            total: 1
        }))
    }
    const documentService = {
        findAll: jest.fn(async () => ({
            items: [
                {
                    id: 'folder-1',
                    knowledgebaseId: 'kb-1',
                    sourceType: DocumentTypeEnum.FOLDER,
                    type: DocumentTypeEnum.FOLDER,
                    name: '101.工艺质量智能体'
                },
                {
                    id: 'doc-1',
                    knowledgebaseId: 'kb-1',
                    sourceType: 'local-file',
                    type: 'pdf',
                    name: '质量手册.pdf',
                    fileUrl: 'https://files.local/doc-1.pdf'
                }
            ],
            total: 2
        })),
        findAncestors: jest.fn(async () => []),
        getChunks: jest.fn(),
        previewFile: jest.fn(),
        createDocument: jest.fn(),
        startProcessing: jest.fn()
    }
    const commandBus = {
        execute: jest.fn()
    }
    const queryBus = {
        execute: jest.fn()
    }
    const service = new KnowledgeWorkbenchService(
        knowledgebaseService as any,
        documentService as any,
        commandBus as any,
        queryBus as unknown as QueryBus
    )

    return {
        service,
        knowledgebaseService,
        documentService,
        commandBus,
        queryBus
    }
}
