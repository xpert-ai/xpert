jest.mock('@metad/server-core', () => ({
    RequestContext: {
        currentUserId: jest.fn()
    }
}))

jest.mock('../../xpert-task.entity', () => ({
    XpertTask: class XpertTask {}
}))

jest.mock('../../xpert-task.service', () => ({
    XpertTaskService: class XpertTaskService {}
}))

import { ScheduleTaskStatus } from '@metad/contracts'
import { RequestContext } from '@metad/server-core'
import { QueryXpertTaskCommand } from '../query.command'
import { QueryXpertTaskHandler } from './query.handler'

describe('QueryXpertTaskHandler', () => {
    let taskService: { findAll: jest.Mock }
    let schedulerRegistry: { getCronJob: jest.Mock }
    let handler: QueryXpertTaskHandler

    beforeEach(() => {
        taskService = {
            findAll: jest.fn()
        }
        schedulerRegistry = {
            getCronJob: jest.fn()
        }
        handler = new QueryXpertTaskHandler(
            taskService as any,
            schedulerRegistry as any,
            {} as any,
            {} as any
        )

        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('looks up scheduled jobs by task id', async () => {
        const job = {
            nextDate: jest.fn()
        }
        taskService.findAll.mockResolvedValue({
            items: [
                {
                    id: 'task-1',
                    name: 'Morning briefing',
                    schedule: null,
                    xpertId: 'xpert-1',
                    agentKey: 'agent-1',
                    prompt: 'Search for stock quotes',
                    status: ScheduleTaskStatus.SCHEDULED,
                    deletedAt: null
                }
            ]
        })
        schedulerRegistry.getCronJob.mockReturnValue(job)

        const result = await handler.execute(new QueryXpertTaskCommand('xpert-1'))

        expect(schedulerRegistry.getCronJob).toHaveBeenCalledWith('task-1')
        expect(result).toEqual([
            expect.objectContaining({
                id: 'task-1',
                name: 'Morning briefing',
                status: ScheduleTaskStatus.SCHEDULED,
                job
            })
        ])
    })

    it('marks tasks as paused when no job is registered', async () => {
        taskService.findAll.mockResolvedValue({
            items: [
                {
                    id: 'task-2',
                    name: 'No job',
                    schedule: null,
                    xpertId: 'xpert-1',
                    agentKey: null,
                    prompt: 'Check something later',
                    status: ScheduleTaskStatus.SCHEDULED,
                    deletedAt: null
                }
            ]
        })
        schedulerRegistry.getCronJob.mockImplementation(() => {
            throw new Error('missing job')
        })

        const result = await handler.execute(new QueryXpertTaskCommand('xpert-1'))

        expect(result[0]).toEqual(
            expect.objectContaining({
                id: 'task-2',
                status: ScheduleTaskStatus.PAUSED,
                job: null
            })
        )
    })
})
