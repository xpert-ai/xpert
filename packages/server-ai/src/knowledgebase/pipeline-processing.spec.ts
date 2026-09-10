import { KnowledgebaseService } from './knowledgebase.service'
import { XpertAgentExecutionUpsertCommand } from '../xpert-agent-execution'
import { XpertEnqueueTriggerDispatchCommand } from '../xpert/commands'
import { channelName, WorkflowNodeTypeEnum } from '@xpert-ai/contracts'

describe('knowledge pipeline dispatch', () => {
    function setup() {
        const taskService = {
            findOneByOptions: jest.fn().mockResolvedValue({ id: 'task-1', context: { documents: [] } }),
            update: jest.fn(),
            failExecution: jest.fn(),
            startDocumentExecution: jest.fn(),
            savePreparedSource: jest.fn(),
            withLockedTask: jest.fn(async (_id, work) => work(await taskService.findOneByOptions(), undefined))
        }
        const commandBus = { execute: jest.fn().mockResolvedValue({ id: 'execution-1' }) }
        const documentService = { createBulk: jest.fn().mockResolvedValue([{ id: 'saved-1' }]) }
        const service = {
            assertKnowledgebaseTaskWriteAccess: jest.fn().mockResolvedValue({ pipelineId: 'pipeline-1' }),
            assertKnowledgebaseTaskSources: jest.fn(),
            taskService,
            commandBus,
            documentService
        }
        const process = () =>
            KnowledgebaseService.prototype.processTask.call(service as never, 'kb-1', 'task-1', {
                stage: 'preview',
                sources: { source: { documents: ['doc-1'] } }
            })
        return { process, taskService, commandBus, service, documentService }
    }

    it('returns from saving after document persistence and dispatch, without waiting for parsing', async () => {
        const { service, taskService, documentService, commandBus } = setup()
        service.assertKnowledgebaseTaskWriteAccess.mockResolvedValue({
            pipelineId: 'pipeline-1',
            pipeline: {
                graph: {
                    nodes: [
                        {
                            key: 'source',
                            type: 'workflow',
                            entity: {
                                type: WorkflowNodeTypeEnum.SOURCE,
                                provider: 'local-file'
                            }
                        }
                    ]
                }
            }
        })
        taskService.findOneByOptions.mockResolvedValue({
            id: 'task-1',
            knowledgebaseId: 'kb-1',
            context: { documents: [{ id: 'doc-1', name: 'small.md' }] }
        })
        commandBus.execute.mockImplementation(async (command) => {
            if (command instanceof XpertEnqueueTriggerDispatchCommand) {
                expect(taskService.startDocumentExecution).toHaveBeenCalledWith('task-1', 'execution-1', ['saved-1'])
                expect(documentService.createBulk).toHaveBeenCalledTimes(1)
                expect(taskService.savePreparedSource).toHaveBeenCalledTimes(1)
                expect(command.state[channelName('source')].documents).toEqual(['saved-1'])
            }
            return { id: 'execution-1' }
        })
        await KnowledgebaseService.prototype.processTask.call(service as never, 'kb-1', 'task-1', {
            stage: 'prod',
            sources: { source: { documents: ['doc-1'] } }
        })
        const dispatch = commandBus.execute.mock.calls[1][0] as XpertEnqueueTriggerDispatchCommand
        expect(dispatch.state[channelName('source')].documents).toEqual(['saved-1'])
    })

    it('leaves a preallocated execution unbound until Chat assigns its authoritative thread', async () => {
        const { process, commandBus } = setup()
        await process()
        const create = commandBus.execute.mock.calls[0][0] as XpertAgentExecutionUpsertCommand
        expect(create.execution.threadId).toBeNull()
        const dispatch = commandBus.execute.mock.calls[1][0] as XpertEnqueueTriggerDispatchCommand
        expect(dispatch.params).toEqual(
            expect.objectContaining({
                executionId: 'execution-1',
                callback: expect.objectContaining({
                    context: { knowledgebaseId: 'kb-1', taskId: 'task-1', executionId: 'execution-1' }
                })
            })
        )
    })

    it('records enqueue failure and propagates the error to the request', async () => {
        const { process, commandBus, taskService } = setup()
        commandBus.execute
            .mockResolvedValueOnce({ id: 'execution-1' })
            .mockRejectedValueOnce(new Error('Queue unavailable'))
        await expect(process()).rejects.toThrow('Queue unavailable')
        expect(taskService.failExecution).toHaveBeenCalledWith(
            expect.objectContaining({
                knowledgebaseId: 'kb-1',
                taskId: 'task-1',
                executionId: 'execution-1'
            }),
            'Queue unavailable'
        )
    })
})
