jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
jest.mock('@langchain/core/callbacks/dispatch', () => ({ dispatchCustomEvent: jest.fn() }))
import { createCreateTasksTool } from './create'
import { XpertProjectTaskService } from '../../../services/project-task.service'
import { IXpertProjectTask } from '@xpert-ai/contracts'
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { randomUUID } from 'node:crypto'

describe('project_create_tasks', () => {
    it('passes explicit hierarchy to the service and returns it without starting execution', async () => {
        const parentTaskId = randomUUID()
        const service = Object.assign(Object.create(XpertProjectTaskService.prototype) as XpertProjectTaskService, {
            createTask: jest.fn(async (projectId: string, input: Partial<IXpertProjectTask>) => ({
                ...input, id: randomUUID(), projectId, revision: 1
            })),
            createExecution: jest.fn()
        })
        const permission = jest.fn()
        const tool = createCreateTasksTool({ projectId: 'project', service, assertPermission: permission })
        const result = await tool.invoke({ tasks: [{
            name: 'Implementation', kind: 'task', parentTaskId, requirements: ['Tests pass'], steps: []
        }, {
            name: 'Delivery', kind: 'summary', requirements: ['Accepted deliverable'], steps: []
        }] })
        expect(permission).toHaveBeenCalledTimes(1)
        expect(service.createTask).toHaveBeenNthCalledWith(1, 'project', expect.objectContaining({
            kind: 'task', parentTaskId, status: 'todo'
        }))
        expect(result.tasks).toEqual([
            expect.objectContaining({ kind: 'task', parentTaskId }),
            expect.objectContaining({ kind: 'summary' })
        ])
        expect(service.createExecution).not.toHaveBeenCalled()
    })

    it.each([{ kind: 'review' }, { parentTaskId: 'invalid-id' }, { providerKey: 'app' }])(
        'rejects invalid or protected hierarchy input (%j)', async (input) => {
            const service = Object.assign(Object.create(XpertProjectTaskService.prototype) as XpertProjectTaskService, {
                createTask: jest.fn()
            })
            const tool = createCreateTasksTool({ projectId: 'project', service, assertPermission: jest.fn() })
            await expect(tool.schema.parseAsync({ tasks: [{ name: 'Child', requirements: ['Done'], steps: [], ...input }] }))
                .rejects.toThrow()
        }
    )

    it('checks permission before creating hierarchy entries', async () => {
        const service = Object.assign(Object.create(XpertProjectTaskService.prototype) as XpertProjectTaskService, {
            createTask: jest.fn()
        })
        const tool = createCreateTasksTool({ projectId: 'project', service,
            assertPermission: jest.fn(async () => { throw new Error('Forbidden') }) })
        await expect(tool.invoke({ tasks: [{
            name: 'Child', kind: 'task', parentTaskId: randomUUID(), requirements: ['Done'], steps: []
        }] })).rejects.toThrow('Forbidden')
        expect(service.createTask).not.toHaveBeenCalled()
    })

    it.each([false, true])(
        'preserves committed tasks and origin links when card emission fails: %s',
        async (failCard) => {
            const dispatch = jest.mocked(dispatchCustomEvent)
            dispatch.mockReset()
            if (failCard) dispatch.mockRejectedValueOnce(new Error('Card stream disconnected'))
            const service = Object.assign(Object.create(XpertProjectTaskService.prototype) as XpertProjectTaskService, {
                createTask: jest.fn(async (projectId: string, input: Partial<IXpertProjectTask>) => ({
                    ...input,
                    id: 'task',
                    projectId,
                    revision: 1
                })),
                createExecution: jest.fn(),
                linkConversation: jest.fn(),
                translate: jest.fn(async () => 'Creating tasks')
            })
            const permission = jest.fn()
            const tool = createCreateTasksTool({
                projectId: 'project',
                service,
                conversationId: 'conversation',
                assertPermission: permission
            })
            const result = await tool.invoke(
                {
                    tasks: [
                        {
                            name: 'Reconcile expenses',
                            type: 'finance',
                            requirements: ['Match receipts'],
                            steps: [{ description: 'Compare totals' }]
                        }
                    ]
                },
                { configurable: { thread_id: 'thread', executionId: 'parent' } }
            )
            expect(result).toEqual({
                tasks: [
                    {
                        id: 'task',
                        projectId: 'project',
                        revision: 1,
                        title: 'Reconcile expenses',
                        status: 'todo',
                        requirements: ['Match receipts']
                    }
                ]
            })
            expect(permission).toHaveBeenCalledTimes(1)
            expect(service.createExecution).not.toHaveBeenCalled()
            expect(service.linkConversation).toHaveBeenCalledWith(
                'project',
                'task',
                expect.objectContaining({ relationType: 'origin' })
            )
            expect(dispatch).not.toHaveBeenCalled()
            expect(service.createTask).toHaveBeenCalledTimes(1)
        }
    )
})
