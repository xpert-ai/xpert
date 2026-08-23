import { XpertProjectTaskService } from './project-task.service'

describe('XpertProjectTaskService.updateTaskSteps', () => {
    it('marks a task done when every step is completed even if status is omitted', async () => {
        const task = {
            id: 'task-1',
            name: 'Ship the change',
            status: 'in_progress',
            steps: [{ stepIndex: 1, status: 'pending', notes: '' }]
        }
        const service = Object.create(XpertProjectTaskService.prototype) as any
        service.findAll = jest.fn().mockResolvedValue({ items: [task] })
        service.stepRepository = { save: jest.fn(async (steps) => steps) }
        service.repository = { save: jest.fn(async (value) => value) }

        await service.updateTaskSteps('project-1', 'thread-1', {
            id: 'task-1',
            steps: [{ stepIndex: 1, status: 'done' }]
        })

        expect(task.status).toBe('done')
        expect(service.repository.save).toHaveBeenCalledWith(task)
    })

    it('keeps an explicit blocked status when step updates include a failure', async () => {
        const task = {
            id: 'task-2',
            name: 'Investigate failure',
            status: 'in_progress',
            steps: [{ stepIndex: 1, status: 'running', notes: '' }]
        }
        const service = Object.create(XpertProjectTaskService.prototype) as any
        service.findAll = jest.fn().mockResolvedValue({ items: [task] })
        service.stepRepository = { save: jest.fn(async (steps) => steps) }
        service.repository = { save: jest.fn(async (value) => value) }

        await service.updateTaskSteps('project-1', 'thread-1', {
            id: 'task-2',
            status: 'blocked',
            steps: [{ stepIndex: 1, status: 'failed', notes: 'Command failed' }]
        })

        expect(task.status).toBe('blocked')
        expect(service.repository.save).toHaveBeenCalledWith(task)
    })
})
