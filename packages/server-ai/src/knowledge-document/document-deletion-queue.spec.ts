import { NotFoundException } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { Document } from '@langchain/core/documents'
import { IKnowledgebase, IKnowledgeDocument, KBDocumentStatusEnum } from '@xpert-ai/contracts'
import { Job } from 'bull'
import { KnowledgebaseService } from '../knowledgebase'
import { KnowledgeDocLoadCommand } from './commands'
import { KnowledgeDocumentConsumer } from './document.job'
import { KnowledgeDocumentService } from './document.service'
import { KnowledgeProcessingReadyService } from './processing-lifecycle.module'
import { KnowledgeDerivedIndexPublicationService } from './derived-index-publication.service'

jest.mock('../knowledgebase', () => ({ KnowledgebaseService: class {}, KnowledgeDocumentStore: class {} }))
jest.mock('./document.service', () => ({ KnowledgeDocumentService: class {} }))
jest.mock('./tables/table-metadata.service', () => ({
    KnowledgeTableMetadataService: class {},
    TableMetadataStaleError: class extends Error {}
}))

describe('deletion during a document batch', () => {
    it.each(['queued', 'loading', 'embedding'])(
        'skips a document deleted while %s and finishes its neighbor',
        async (stage) => {
            const docs = ['deleted', 'neighbor'].map((id) => ({
                id,
                knowledgebaseId: 'kb',
                status: KBDocumentStatusEnum.RUNNING
            })) as IKnowledgeDocument[]
            let deleted = stage === 'queued'
            const chunks = [new Document({ pageContent: 'sample image', metadata: { chunkId: 'chunk-1' } })]
            const vectorStore = {
                deleteKnowledgeDocument: jest.fn(),
                addKnowledgeDocument: jest.fn(async () => {
                    deleted = true
                })
            }
            const documents = {
                findOne: jest.fn(async (id: string) => {
                    if (id === 'deleted' && deleted) throw new NotFoundException()
                    return docs.find((doc) => doc.id === id)
                }),
                update: jest.fn(async (_id: string, _patch: Partial<IKnowledgeDocument>) => undefined),
                updateChunkMetadataBulk: jest.fn(),
                findAllEmbeddingNodes: jest.fn(async () => chunks),
                syncChunksIncrementally: jest.fn(async () => ({
                    chunks,
                    embeddingChunks: chunks,
                    contentChanged: true,
                    contentHash: 'hash',
                    statistics: { total: 1, skipped: 0, added: 1, updated: 0, deleted: 0 }
                }))
            }
            const commands = {
                execute: jest.fn(async (command: unknown) => {
                    if (command instanceof KnowledgeDocLoadCommand && command.input.doc.id === 'deleted') {
                        if (stage === 'loading') deleted = true
                        return { chunks }
                    }
                    return {}
                })
            }
            const publication = { publish: jest.fn() }
            const consumer = new KnowledgeDocumentConsumer(
                null,
                { getActiveVectorStore: async () => vectorStore } as unknown as KnowledgebaseService,
                documents as unknown as KnowledgeDocumentService,
                commands as unknown as CommandBus,
                publication as unknown as KnowledgeDerivedIndexPublicationService,
                new KnowledgeProcessingReadyService()
            )
            const kb = { id: 'kb', copilotModel: { copilot: { id: 'copilot' } } } as IKnowledgebase
            const job = { id: 'job', data: { docs, userId: 'user' } } as Job

            await expect(consumer._processJob(kb, docs, job)).resolves.toEqual({})

            expect(documents.update).toHaveBeenCalledWith(
                'neighbor',
                expect.objectContaining({ status: KBDocumentStatusEnum.FINISH })
            )
            expect(
                documents.update.mock.calls.some(
                    ([id, patch]) => id === 'deleted' && patch.status === KBDocumentStatusEnum.ERROR
                )
            ).toBe(false)
            expect(publication.publish).not.toHaveBeenCalledWith(expect.objectContaining({ documentId: 'deleted' }))
            if (stage === 'embedding')
                expect(vectorStore.deleteKnowledgeDocument).toHaveBeenCalledWith(
                    expect.objectContaining({ id: 'deleted' })
                )
            else expect(vectorStore.addKnowledgeDocument).not.toHaveBeenCalled()
        }
    )
})
