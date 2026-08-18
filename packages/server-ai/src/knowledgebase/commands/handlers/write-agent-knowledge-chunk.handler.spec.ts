import { NotFoundException } from '@nestjs/common'
import { KDocumentSourceType, KnowledgeStructureEnum, KnowledgebaseTypeEnum } from '@xpert-ai/contracts'
import { WriteAgentKnowledgeChunkCommand } from '../write-agent-knowledge-chunk.command'
import { WriteAgentKnowledgeChunkHandler } from './write-agent-knowledge-chunk.handler'

jest.mock('../../../knowledge-document/chunk/chunk.service', () => ({
    KnowledgeDocumentChunkService: class KnowledgeDocumentChunkService {}
}))

jest.mock('../../../knowledge-document/document.service', () => ({
    KnowledgeDocumentService: class KnowledgeDocumentService {}
}))

jest.mock('../../knowledgebase.service', () => ({
    KnowledgebaseService: class KnowledgebaseService {}
}))

describe('WriteAgentKnowledgeChunkHandler', () => {
    it('selects workspace scope fields when resolving the target knowledgebase', async () => {
        const findOne = jest.fn().mockResolvedValue({
            id: 'knowledgebase-1',
            name: 'Docs',
            type: KnowledgebaseTypeEnum.Standard,
            structure: KnowledgeStructureEnum.General,
            copilotModelId: 'model-1'
        })
        const knowledgebaseService = { findOne }
        const documentService = {
            findOneByOptions: jest.fn().mockResolvedValue({ id: 'document-1' }),
            createChunk: jest.fn()
        }
        const chunkService = {
            findOneByOptions: jest.fn().mockResolvedValue({ id: 'chunk-1' })
        }
        const handler = new WriteAgentKnowledgeChunkHandler(
            knowledgebaseService as unknown as ConstructorParameters<typeof WriteAgentKnowledgeChunkHandler>[0],
            documentService as unknown as ConstructorParameters<typeof WriteAgentKnowledgeChunkHandler>[1],
            chunkService as unknown as ConstructorParameters<typeof WriteAgentKnowledgeChunkHandler>[2]
        )

        await handler.execute(
            new WriteAgentKnowledgeChunkCommand({
                knowledgebaseIds: ['knowledgebase-1'],
                knowledgebaseId: 'knowledgebase-1',
                xpertId: 'xpert-1',
                agentKey: 'agent-1',
                text: 'content',
                writeKey: 'write-key-1'
            })
        )

        expect(findOne).toHaveBeenCalledWith(
            'knowledgebase-1',
            expect.objectContaining({
                select: expect.objectContaining({
                    id: true,
                    name: true,
                    type: true,
                    structure: true,
                    copilotModelId: true,
                    workspaceId: true,
                    tenantId: true,
                    organizationId: true
                })
            })
        )
    })

    it('creates an independently managed document inside the requested knowledgebase folder', async () => {
        const knowledgebaseService = {
            findOne: jest.fn().mockResolvedValue({
                id: 'knowledgebase-1',
                name: 'Domain KB',
                type: KnowledgebaseTypeEnum.Standard,
                structure: KnowledgeStructureEnum.General,
                copilotModelId: 'model-1'
            })
        }
        const folder = {
            id: 'folder-1',
            knowledgebaseId: 'knowledgebase-1',
            sourceType: KDocumentSourceType.FOLDER
        }
        const documentService = {
            findOneByOptions: jest.fn().mockRejectedValue(new NotFoundException()),
            findOne: jest.fn().mockResolvedValue(folder),
            createDocument: jest
                .fn()
                .mockResolvedValue({ id: 'document-1', version: 1, name: 'PBOM-1', parent: folder }),
            createChunk: jest.fn()
        }
        const chunkService = {
            findOneByOptions: jest.fn().mockRejectedValue(new NotFoundException())
        }
        const handler = new WriteAgentKnowledgeChunkHandler(
            knowledgebaseService as unknown as ConstructorParameters<typeof WriteAgentKnowledgeChunkHandler>[0],
            documentService as unknown as ConstructorParameters<typeof WriteAgentKnowledgeChunkHandler>[1],
            chunkService as unknown as ConstructorParameters<typeof WriteAgentKnowledgeChunkHandler>[2]
        )

        const result = await handler.execute(
            new WriteAgentKnowledgeChunkCommand({
                knowledgebaseIds: ['knowledgebase-1'],
                knowledgebaseId: 'knowledgebase-1',
                xpertId: 'xpert-1',
                agentKey: 'agent-1',
                text: 'complete PBOM projection',
                writeKey: 'pbom:v2:1',
                document: {
                    key: 'pbom-document-1',
                    name: 'PBOM-1',
                    parentId: 'folder-1',
                    metadata: { folder_path: 'super-bom/MOTOR_01/1.0.0' }
                }
            })
        )

        expect(documentService.createDocument).toHaveBeenCalledWith(
            expect.objectContaining({
                knowledgebaseId: 'knowledgebase-1',
                name: 'PBOM-1',
                parent: folder,
                metadata: expect.objectContaining({
                    managedDocumentKey: 'pbom-document-1',
                    folder_path: 'super-bom/MOTOR_01/1.0.0'
                })
            })
        )
        expect(documentService.createChunk).toHaveBeenCalledTimes(1)
        expect(result).toEqual(expect.objectContaining({ status: 'created', documentId: 'document-1' }))
    })
})
