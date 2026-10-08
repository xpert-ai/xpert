jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
jest.mock('@langchain/core/callbacks/dispatch', () => ({ dispatchCustomEvent: jest.fn() }))
import { createCreateTasksTool } from './create'
import { XpertProjectTaskService } from '../../../services/project-task.service'
import { IXpertProjectTask } from '@xpert-ai/contracts'
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'

describe('project_create_tasks', () => {
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
            expect(dispatch).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    type: 'resource_card',
                    data: expect.objectContaining({
                        resource: { namespace: 'platform.project-tasks', type: 'task', id: 'task' },
                        title: 'Reconcile expenses'
                    })
                }),
                expect.objectContaining({ configurable: expect.objectContaining({ executionId: 'parent' }) })
            )
            expect(service.createTask).toHaveBeenCalledTimes(1)
        }
    )
})
