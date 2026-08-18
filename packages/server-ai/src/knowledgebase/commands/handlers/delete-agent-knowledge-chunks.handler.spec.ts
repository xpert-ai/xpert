import { DeleteAgentKnowledgeChunksCommand } from '../delete-agent-knowledge-chunks.command'
import { DeleteAgentKnowledgeChunksHandler } from './delete-agent-knowledge-chunks.handler'

jest.mock('../../../knowledge-document/chunk/chunk.service', () => ({
    KnowledgeDocumentChunkService: class KnowledgeDocumentChunkService {}
}))

jest.mock('../../../knowledge-document/document.service', () => ({
    KnowledgeDocumentService: class KnowledgeDocumentService {}
}))

describe('DeleteAgentKnowledgeChunksHandler', () => {
    it('deletes matching agent-written chunks from the document and vector store', async () => {
        const documentService = {
            findOneByOptions: jest.fn().mockResolvedValue({ id: 'document-1' }),
            deleteChunk: jest.fn()
        }
        const chunkService = {
            findAll: jest.fn().mockResolvedValue({
                items: [{ id: 'chunk-1' }, { id: 'chunk-2' }]
            })
        }
        const handler = new DeleteAgentKnowledgeChunksHandler(
            documentService as unknown as ConstructorParameters<typeof DeleteAgentKnowledgeChunksHandler>[0],
            chunkService as unknown as ConstructorParameters<typeof DeleteAgentKnowledgeChunksHandler>[1]
        )

        const result = await handler.execute(
            new DeleteAgentKnowledgeChunksCommand({
                xpertId: 'xpert-1',
                agentKey: 'agent-1',
                knowledgebaseIds: ['kb-1'],
                knowledgebaseId: 'kb-1',
                writeKeyPrefix: 'bom-product-profile:v2:root-1:'
            })
        )

        expect(chunkService.findAll).toHaveBeenCalledWith({
            where: [expect.objectContaining({ documentId: 'document-1' })]
        })
        expect(documentService.deleteChunk).toHaveBeenCalledWith('document-1', 'chunk-1')
        expect(documentService.deleteChunk).toHaveBeenCalledWith('document-1', 'chunk-2')
        expect(result).toEqual(
            expect.objectContaining({
                deletedCount: 2,
                knowledgebaseId: 'kb-1',
                documentId: 'document-1',
                writeKeyPrefix: 'bom-product-profile:v2:root-1:'
            })
        )
    })

    it('scopes deletion to a managed document key and removes the document when it becomes empty', async () => {
        const documentService = {
            findOneByOptions: jest.fn().mockResolvedValue({ id: 'document-pbom-1' }),
            deleteChunk: jest.fn(),
            deleteBulk: jest.fn()
        }
        const chunkService = {
            findAll: jest
                .fn()
                .mockResolvedValueOnce({ items: [{ id: 'chunk-pbom-1' }] })
                .mockResolvedValueOnce({ items: [] })
        }
        const handler = new DeleteAgentKnowledgeChunksHandler(
            documentService as unknown as ConstructorParameters<typeof DeleteAgentKnowledgeChunksHandler>[0],
            chunkService as unknown as ConstructorParameters<typeof DeleteAgentKnowledgeChunksHandler>[1]
        )

        const result = await handler.execute(
            new DeleteAgentKnowledgeChunksCommand({
                xpertId: 'xpert-1',
                agentKey: 'agent-1',
                knowledgebaseIds: ['kb-1'],
                knowledgebaseId: 'kb-1',
                documentKey: 'pbom-document-1',
                writeKeyPrefix: 'pbom_revision_projection:v2:root-1:',
                deleteDocumentIfEmpty: true
            })
        )

        expect(documentService.deleteBulk).toHaveBeenCalledWith(['document-pbom-1'])
        expect(result).toEqual(
            expect.objectContaining({
                deletedCount: 1,
                documentId: 'document-pbom-1',
                documentDeleted: true
            })
        )
    })
})
