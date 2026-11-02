import { XpertProjectTaskService } from './project-task.service'
import { XpertProject } from '../entities/project.entity'
import { XpertProjectTask } from '../entities/project-task.entity'
import { XpertProjectTaskExecution } from '../entities/project-task-execution.entity'
import { XpertProjectXpertBindingService } from './project-xpert-binding.service'
import { Xpert } from '../../xpert/xpert.entity'
import { Repository } from 'typeorm'
import { XpertTypeEnum } from '@xpert-ai/contracts'

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
    )
) {
    const service = Object.create(XpertProjectTaskService.prototype) as XpertProjectTaskService
    const tasks = { find: jest.fn(async () => [task]), save: jest.fn(async (value) => value) }
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
