import {
    IKnowledgebaseTask,
    IKnowledgeDocument,
    KBDocumentStatusEnum,
    TXpertGraph,
    WorkflowNodeTypeEnum
} from '@xpert-ai/contracts'
import { prepareKnowledgePipelineDocuments } from './prepare-pipeline-documents'
import type { KnowledgeDocument } from '../../knowledge-document/document.entity'

describe('saving a pipeline import before background processing', () => {
    const graph = {
        nodes: [
            { key: 'source', type: 'workflow', entity: { type: WorkflowNodeTypeEnum.SOURCE, provider: 'local-file' } }
        ],
        connections: []
    } as unknown as TXpertGraph
    const task = {
        id: 'task',
        knowledgebaseId: 'kb',
        documents: [],
        context: {
            documents: [{ id: 'preview', name: 'small.md', parent: { id: 'folder' }, filePath: 'files/small.md' }]
        }
    } as IKnowledgebaseTask
    const inputs = { stage: 'prod' as const, sources: { source: { documents: ['preview'] } } }

    function setup() {
        const documents = {
            createBulk: jest.fn(async (_documents: Partial<IKnowledgeDocument>[]) => [
                { id: 'saved' } as KnowledgeDocument
            ])
        }
        const tasks = {
            savePreparedSource: jest.fn(async () => undefined),
            withLockedTask: jest.fn(async (_id, work) => work(task, undefined))
        }
        return { documents, tasks }
    }

    it('saves the visible row and its task relation before returning IDs for dispatch', async () => {
        const { documents, tasks } = setup()
        const result = await prepareKnowledgePipelineDocuments(task, graph, inputs, documents, tasks)
        expect(documents.createBulk).toHaveBeenCalledWith(
            [
                expect.objectContaining({
                    name: 'small.md',
                    knowledgebaseId: 'kb',
                    parent: { id: 'folder' },
                    status: KBDocumentStatusEnum.WAITING,
                    sourceConfig: { key: 'source' },
                    progress: 0
                })
            ],
            undefined
        )
        expect(documents.createBulk.mock.calls[0][0][0]).not.toHaveProperty('id')
        expect(tasks.savePreparedSource).toHaveBeenCalledWith(
            'task',
            'source',
            { preview: 'saved' },
            [{ id: 'saved' }],
            expect.objectContaining({ task })
        )
        expect(result.sources.source.documents).toEqual(['saved'])
    })

    it('does not create formal documents during preview', async () => {
        const { documents, tasks } = setup()
        await prepareKnowledgePipelineDocuments(task, graph, { ...inputs, stage: 'preview' }, documents, tasks)
        expect(documents.createBulk).not.toHaveBeenCalled()
        expect(tasks.savePreparedSource).not.toHaveBeenCalled()
    })

    it('reuses saved IDs when retrying the same selection', async () => {
        const { documents, tasks } = setup()
        const preparedTask = {
            ...task,
            context: { ...task.context, materializedSources: { source: { preview: 'saved' } } }
        }
        tasks.withLockedTask.mockImplementation(async (_id, work) => work(preparedTask, undefined))
        const result = await prepareKnowledgePipelineDocuments(preparedTask, graph, inputs, documents, tasks)
        expect(documents.createBulk).not.toHaveBeenCalled()
        expect(result.sources.source.documents).toEqual(['saved'])
    })

    it('waits for persistence but does not require a workflow execution result', async () => {
        const { documents, tasks } = setup()
        let finish: () => void
        tasks.savePreparedSource.mockReturnValue(
            new Promise<void>((resolve) => {
                finish = resolve
            })
        )
        let done = false
        const saving = prepareKnowledgePipelineDocuments(task, graph, inputs, documents, tasks).then(() => {
            done = true
        })
        await Promise.resolve()
        expect(done).toBe(false)
        finish()
        await saving
        expect(done).toBe(true)
    })

    it('validates all source nodes before creating any documents', async () => {
        const { documents, tasks } = setup()
        await expect(
            prepareKnowledgePipelineDocuments(
                task,
                graph,
                {
                    ...inputs,
                    sources: { ...inputs.sources, missing: { documents: ['preview'] } }
                },
                documents,
                tasks
            )
        ).rejects.toThrow()
        expect(documents.createBulk).not.toHaveBeenCalled()
    })

    it.each(['binding', 'partial batch'])(
        'rolls back %s failure, then retries without orphan rows',
        async (failure) => {
            const committed: KnowledgeDocument[] = []
            const transaction = { rows: [] as KnowledgeDocument[] }
            let failBatch = failure === 'partial batch'
            const documents = {
                createBulk: jest.fn(async (_input, manager?) => {
                    const row = { id: `saved-${committed.length + transaction.rows.length}` } as KnowledgeDocument
                    const target = manager === transaction ? transaction.rows : committed
                    target.push(row)
                    if (failBatch) {
                        failBatch = false
                        throw new Error('Second document failed')
                    }
                    return [row]
                })
            }
            const tasks = {
                savePreparedSource: jest.fn().mockResolvedValue(undefined),
                withLockedTask: jest.fn(async (_id, work) => {
                    transaction.rows = []
                    const result = await work(task, transaction)
                    committed.push(...transaction.rows)
                    return result
                })
            }
            if (failure === 'binding') tasks.savePreparedSource.mockRejectedValueOnce(new Error('Binding failed'))
            await expect(prepareKnowledgePipelineDocuments(task, graph, inputs, documents, tasks)).rejects.toThrow()
            expect(committed).toHaveLength(0)
            await prepareKnowledgePipelineDocuments(task, graph, inputs, documents, tasks)
            expect(committed).toHaveLength(1)
        }
    )

    it('uses the latest bindings under the lock when concurrent callers have the same stale task snapshot', async () => {
        const latest = structuredClone(task)
        let previous = Promise.resolve()
        const { documents } = setup()
        const tasks = {
            withLockedTask: jest.fn((_id, work) => {
                const pending = previous.then(() => work(latest, undefined))
                previous = pending.then(() => undefined)
                return pending
            }),
            savePreparedSource: jest.fn(async (_id, key, bindings) => {
                latest.context.materializedSources = { ...latest.context.materializedSources, [key]: bindings }
            })
        }
        const results = await Promise.all([
            prepareKnowledgePipelineDocuments(task, graph, inputs, documents, tasks),
            prepareKnowledgePipelineDocuments(task, graph, inputs, documents, tasks)
        ])
        expect(documents.createBulk).toHaveBeenCalledTimes(1)
        expect(results.map((result) => result.sources.source.documents)).toEqual([['saved'], ['saved']])
    })
})
