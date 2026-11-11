jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { randomUUID } from 'node:crypto'
import { XpertProjectTaskService } from './project-task.service'
import { XpertProject } from '../entities/project.entity'
import { XpertProjectTask } from '../entities/project-task.entity'
import { XpertProjectTaskExecution } from '../entities/project-task-execution.entity'
import { XpertProjectXpertBindingService } from './project-xpert-binding.service'
import { Xpert } from '../../xpert/xpert.entity'
import { Repository } from 'typeorm'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import { createUpdateTasksTool } from '../plugins/project-tasks/tools/update'

function fixture(
    task: {
        id: string
        name: string
        status: string
        steps: object[]
        executions?: object[]
        assigneeXpertId?: string
    },
    members: Array<string | Xpert> = [],
    records = members.map((item) =>
        typeof item === 'string' ? Object.assign(new Xpert(), { id: item, latest: true }) : item
    ),
    otherTasks: XpertProjectTask[] = []
) {
    const service = Object.create(XpertProjectTaskService.prototype) as XpertProjectTaskService
    const tasks = {
        findOneBy: jest.fn(async () => task),
        find: jest.fn(async () => [task, ...otherTasks]),
        save: jest.fn(async (value) => value)
    }
    const manager = {
        getRepository: (entity: object) =>
            entity === XpertProject
                ? {
                      findOne: jest.fn(async () => ({
                          xperts: members.map((item) => (typeof item === 'string' ? { id: item } : item))
                      }))
                  }
                : entity === XpertProjectTask
                  ? tasks
                  : entity === XpertProjectTaskExecution
                    ? { existsBy: jest.fn(async () => !!task.executions?.length) }
                    : { save: jest.fn(async (value) => value) }
    }
    Object.assign(service, {
        repository: { ...tasks, manager: { transaction: async (operation) => operation(manager) } },
        xpertBindings: new XpertProjectXpertBindingService(
            Object.assign(Object.create(Repository.prototype) as Repository<Xpert>, {
                findOne: jest.fn(
                    async ({ where }) =>
                        records.find((item) =>
                            where.id
                                ? item.id === where.id
                                : item.latest &&
                                  item.slug === where.slug &&
                                  item.type === where.type &&
                                  item.workspaceId === where.workspaceId
                        ) ?? null
                )
            }),
            Object.create(Repository.prototype) as Repository<XpertProject>
        )
    })
    return service
}

describe('XpertProjectTaskService.updateTaskSteps', () => {
    it('returns only changed tasks and leaves unrelated Pipeline projections alone', async () => {
        const task = { id: 'task', name: 'Implementation', status: 'todo', steps: [] }
        const pipeline = Object.assign(new XpertProjectTask(), { id: 'pipeline', controlKind: 'pipeline',
            pipelineInstanceId: 'instance', status: 'in_progress', steps: [], executions: [] })
        const service = fixture(task, [], [], [pipeline])
        const updated = await service.updateTaskSteps('project', 'thread', { id: task.id, status: 'cancelled' })
        expect(updated).toEqual([task])
        expect(task.status).toBe('cancelled')
        expect(pipeline.status).toBe('in_progress')
    })

    it('updates native execution bookkeeping once without visiting an unrelated Pipeline task', async () => {
        const task = { id: randomUUID(), name: 'Implementation', status: 'todo', steps: [] }
        const pipeline = Object.assign(new XpertProjectTask(), { id: randomUUID(), controlKind: 'pipeline',
            pipelineInstanceId: randomUUID(), status: 'in_progress', steps: [], executions: [] })
        const service = fixture(task, [], [], [pipeline])
        const projectId = randomUUID(), executionId = randomUUID()
        const attempt = Object.assign(new XpertProjectTaskExecution(), { id: randomUUID(), taskId: task.id, agentExecutionId: executionId })
        const relations = jest.spyOn(service, 'listTaskRelations').mockImplementation(async (_projectId, taskId) => ({
            conversations: [], executions: [Object.assign(new XpertProjectTaskExecution(), attempt, { taskId })]
        }))
        const update = jest.spyOn(service, 'updateExecution').mockResolvedValue(attempt)
        const permission = jest.fn()
        await createUpdateTasksTool({ projectId, service, assertPermission: permission }).invoke({
            tasks: [{ id: task.id, status: 'in_progress' }, { id: task.id, status: 'blocked' }]
        }, { configurable: { executionId } })
        expect(permission).toHaveBeenCalledTimes(1)
        expect(relations).toHaveBeenCalledTimes(1)
        expect(relations).toHaveBeenCalledWith(projectId, task.id)
        expect(update).toHaveBeenCalledTimes(1)
        expect(update).toHaveBeenCalledWith(projectId, task.id, attempt.id, expect.objectContaining({ status: 'failed' }))
        expect(pipeline.status).toBe('in_progress')
    })

    it.each([false, true])(
        'stores the current Assistant ID for a historical caller (historical Project binding: %s)',
        async (historicalBinding) => {
            const old = Object.assign(new Xpert(), {
                id: 'old',
                tenantId: 'tenant',
                workspaceId: 'workspace',
                slug: 'developer',
                type: XpertTypeEnum.Agent,
                latest: false,
                publishAt: new Date()
            })
            const current = Object.assign(new Xpert(), old, { id: 'current', latest: true })
            const task = { id: 'task', name: 'MVP 04', status: 'blocked', steps: [], assigneeXpertId: undefined }
            const service = fixture(task, [historicalBinding ? old : current], [old, current])
            await service.updateTaskSteps('project', 'thread', { id: task.id, assigneeXpertId: old.id })
            expect(task.assigneeXpertId).toBe(current.id)
            expect(task.status).toBe('blocked')
        }
    )
    it('assigns an explicit project member without starting execution and preserves assignment when omitted', async () => {
        const task = { id: 'task', name: 'Planning', status: 'todo', steps: [], assigneeXpertId: undefined }
        const service = fixture(task, ['member'])
        await service.updateTaskSteps('project', 'thread', { id: task.id, assigneeXpertId: 'member' })
        expect(task.assigneeXpertId).toBe('member')
        expect(task.status).toBe('todo')
        await service.updateTaskSteps('project', 'thread', { id: task.id, status: 'blocked' })
        expect(task.assigneeXpertId).toBe('member')
    })
    it('rejects a non-member assignee without changing the current owner', async () => {
        const task = { id: 'task', name: 'Planning', status: 'todo', steps: [], assigneeXpertId: 'member' }
        await expect(
            fixture(task, ['member']).updateTaskSteps('project', 'thread', { id: task.id, assigneeXpertId: 'outsider' })
        ).rejects.toThrow()
        expect(task.assigneeXpertId).toBe('member')
    })
    it('marks a task done when every step is completed even if status is omitted', async () => {
        const task = {
            id: 'task-1',
            name: 'Ship the change',
            status: 'in_progress',
            steps: [{ stepIndex: 1, status: 'pending', notes: '' }]
        }
        const service = fixture(task)

        await service.updateTaskSteps('project-1', 'thread-1', {
            id: 'task-1',
            steps: [{ stepIndex: 1, status: 'done' }]
        })

        expect(task.status).toBe('done')
        expect(task.steps[0].status).toBe('done')
    })

    it('does not auto-accept a Runtime task when reported steps are all done', async () => {
        const task = {
            id: 'task-runtime',
            name: 'delegated',
            status: 'review',
            steps: [{ stepIndex: 1, status: 'pending' }],
            executions: [{ invocationId: 'invocation' }]
        }
        const service = fixture(task)
        await service.updateTaskSteps('project', 'thread', { id: task.id, steps: [{ stepIndex: 1, status: 'done' }] })
        expect(task.status).toBe('review')
    })
    it('keeps an explicit blocked status when step updates include a failure', async () => {
        const task = {
            id: 'task-2',
            name: 'Investigate failure',
            status: 'in_progress',
            steps: [{ stepIndex: 1, status: 'running', notes: '' }]
        }
        const service = fixture(task)

        await service.updateTaskSteps('project-1', 'thread-1', {
            id: 'task-2',
            status: 'blocked',
            steps: [{ stepIndex: 1, status: 'failed', notes: 'Command failed' }]
        })

        expect(task.status).toBe('blocked')
        expect(task.steps[0].status).toBe('failed')
    })
})
