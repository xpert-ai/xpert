jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))

import { CommandBus, QueryBus } from '@nestjs/cqrs'
import {
    channelName,
    IEnvironment,
    IKnowledgeDocument,
    IWFNKnowledgeBase,
    KBDocumentStatusEnum,
    KnowledgebaseChannel,
    KnowledgeTask,
    TXpertGraph,
    TXpertTeamNode,
    WorkflowNodeTypeEnum
} from '@xpert-ai/contracts'
import { AgentStateAnnotation } from '../../../shared'
import { WorkflowKnowledgeBaseNodeStrategy } from './strategy'

describe('knowledge pipeline indexing', () => {
    function setup() {
        const chunks = [{ id: 'chunk', pageContent: 'A short document', metadata: {} }]
        const document = {
            id: 'document',
            knowledgebaseId: 'kb',
            name: 'test.md',
            status: KBDocumentStatusEnum.SPLITTED,
            draft: { chunks },
            metadata: {}
        } as IKnowledgeDocument
        const documents = {
            findAll: jest.fn(async () => ({ items: [document] })),
            findOne: jest.fn(async () => document),
            update: jest.fn(async () => undefined),
            findAllEmbeddingNodes: jest.fn(async () => chunks),
            syncChunksIncrementally: jest.fn(async () => ({
                chunks,
                embeddingChunks: chunks,
                contentChanged: true,
                contentHash: 'hash',
                statistics: { total: 1, skipped: 0, added: 1, updated: 0, deleted: 0 }
            })),
            updateChunkMetadataBulk: jest.fn(async () => undefined)
        }
        const tasks = { update: jest.fn(async () => undefined) }
        const vectorStore = { addKnowledgeDocument: jest.fn(async () => undefined) }
        const publication = { publish: jest.fn(async () => undefined) }
        const strategy = new WorkflowKnowledgeBaseNodeStrategy(
            { execute: jest.fn(async () => ({ id: 'execution' })) } as unknown as CommandBus,
            { execute: jest.fn(async () => ({ id: 'execution' })) } as unknown as QueryBus
        )
        Object.assign(strategy, {
            documentService: documents,
            taskService: tasks,
            publicationService: publication,
            knowledgebaseService: {
                findOne: jest.fn(async () => ({
                    id: 'kb',
                    copilotModel: { copilot: { id: 'copilot' } }
                })),
                getActiveVectorStore: jest.fn(async () => vectorStore)
            }
        })
        const entity: IWFNKnowledgeBase = {
            id: 'result',
            key: 'result',
            type: WorkflowNodeTypeEnum.KNOWLEDGE_BASE,
            inputs: ['input.documents']
        }
        const node = strategy.create({
            graph: { nodes: [], connections: [] } as TXpertGraph,
            node: { key: 'result', type: 'workflow', entity } as TXpertTeamNode & { type: 'workflow' },
            xpertId: 'pipeline',
            environment: {} as IEnvironment,
            isDraft: false
        })
        const run = () =>
            node.graph.invoke(
                {
                    [KnowledgebaseChannel]: { knowledgebaseId: 'kb', [KnowledgeTask]: 'task', stage: 'prod' },
                    input: { documents: [{ id: document.id }] }
                } as unknown as typeof AgentStateAnnotation.State,
                { configurable: {} }
            )
        return { strategy, documents, tasks, vectorStore, publication, run }
    }

    it('includes the primary key when reading cancellation status under tenant joins', async () => {
        const { strategy, documents } = setup()
        expect(await strategy.checkIfJobCancelled('document')).toBe(false)
        expect(documents.findOne).toHaveBeenCalledWith('document', { select: ['id', 'status'] })
    })

    it('finishes indexing and publishes only after persisting document completion', async () => {
        const { run, documents, tasks, vectorStore, publication } = setup()
        const result = await run()
        expect(vectorStore.addKnowledgeDocument).toHaveBeenCalledTimes(1)
        expect(documents.update).toHaveBeenCalledWith(
            'document',
            expect.objectContaining({ status: KBDocumentStatusEnum.FINISH })
        )
        expect(publication.publish).toHaveBeenCalledTimes(1)
        expect(tasks.update).toHaveBeenLastCalledWith('task', {
            status: 'success',
            error: null,
            finishedAt: expect.any(Date)
        })
        expect(result[channelName('result')].task.status).toBe('success')
    })

    it('waits for document failure persistence and reports a failed batch instead of success', async () => {
        const { run, documents, tasks, vectorStore, publication } = setup()
        vectorStore.addKnowledgeDocument.mockRejectedValueOnce(new Error('Embedding failed'))
        let releaseFailure: () => void
        const persisted = new Promise<void>((resolve) => {
            releaseFailure = resolve
        })
        let signalFailure: () => void
        const failing = new Promise<void>((resolve) => {
            signalFailure = resolve
        })
        documents.update.mockImplementation(async (_id?: string, patch?: Partial<IKnowledgeDocument>) => {
            if (patch?.status === KBDocumentStatusEnum.ERROR) {
                signalFailure()
                await persisted
            }
        })
        const processing = run()
        await failing
        expect(tasks.update).not.toHaveBeenCalled()
        releaseFailure()
        const result = await processing
        expect(tasks.update).toHaveBeenLastCalledWith('task', {
            status: 'failed',
            error: 'Embedding failed',
            finishedAt: expect.any(Date)
        })
        expect(result[channelName('result')].task.status).toBe('failed')
        expect(publication.publish).not.toHaveBeenCalled()
    })
})
