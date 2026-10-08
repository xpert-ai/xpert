import { XpertProjectTaskService } from './project-task.service'
import { XpertProject } from '../entities/project.entity'
import { XpertProjectTask } from '../entities/project-task.entity'
import { XpertProjectTaskExecution } from '../entities/project-task-execution.entity'

function fixture(task: { id: string; name: string; status: string; steps: object[]; executions?: object[] }) {
    const service = Object.create(XpertProjectTaskService.prototype) as XpertProjectTaskService
    const tasks = { find: jest.fn(async () => [task]), save: jest.fn(async (value) => value) }
    const manager = {
        getRepository: (entity: object) =>
            entity === XpertProject
                ? { findOne: jest.fn(async () => ({})) }
                : entity === XpertProjectTask
                  ? tasks
                  : entity === XpertProjectTaskExecution
                    ? { existsBy: jest.fn(async () => !!task.executions?.length) }
                    : { save: jest.fn(async (value) => value) }
    }
    Object.assign(service, {
        repository: { ...tasks, manager: { transaction: async (operation) => operation(manager) } }
    })
    return service
}

describe('XpertProjectTaskService.updateTaskSteps', () => {
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
