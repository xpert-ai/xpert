jest.mock('@xpert-ai/server-core', () => ({
    CrudController: class CrudController {
        constructor() {}
    },
    PaginationParams: class PaginationParams {},
    ParseJsonPipe: class ParseJsonPipe {},
    RequestContext: { currentUserId: jest.fn().mockReturnValue('user-1') },
    TimeZone: () => () => undefined,
    TransformInterceptor: class TransformInterceptor {},
    transformWhere: jest.fn((where: unknown) => where)
}))

jest.mock('nestjs-i18n', () => ({
    I18nLang: () => () => undefined
}))

jest.mock('./xpert-task.entity', () => ({
    XpertTask: class XpertTask {}
}))

jest.mock('./xpert-task.service', () => ({
    XpertTaskService: class XpertTaskService {}
}))

jest.mock('./commands', () => ({
    CreateXpertTaskCommand: class CreateXpertTaskCommand {
        constructor(public readonly task: unknown) {}
    }
}))

jest.mock('./dto/simple.dto', () => ({
    SimpleXpertTask: class SimpleXpertTask {
        constructor(value: object) {
            Object.assign(this, value)
        }
    }
}))

import { ScheduleTaskStatus } from '@xpert-ai/contracts'
import { XpertTaskController } from './xpert-task.controller'

describe('XpertTaskController HTTP access boundary', () => {
    const task = { id: 'task-1', projectId: 'project-1' }
    const service = {
        findHttpAccessible: jest.fn().mockResolvedValue({ items: [task], total: 1 }),
        findHttpAccessibleById: jest.fn().mockResolvedValue(task),
        updateHttpTask: jest.fn().mockResolvedValue(task),
        scheduleHttpTask: jest.fn().mockResolvedValue(task),
        pauseHttpTask: jest.fn().mockResolvedValue(task),
        archiveHttpTask: jest.fn().mockResolvedValue(task),
        unarchiveHttpTask: jest.fn().mockResolvedValue(task),
        testHttpTask: jest.fn().mockResolvedValue(task),
        deleteHttpTask: jest.fn().mockResolvedValue(undefined),
        softDeleteHttpTask: jest.fn().mockResolvedValue(task),
        recoverHttpTask: jest.fn().mockResolvedValue(task),
        proposeProjectTaskRunAs: jest.fn().mockResolvedValue(task),
        acceptProjectTaskRunAs: jest.fn().mockResolvedValue(task)
    }
    const controller = new XpertTaskController(service as never, { execute: jest.fn() } as never)

    beforeEach(() => jest.clearAllMocks())

    it('routes generic and my-list reads through the Project-aware HTTP query', async () => {
        const params = {
            where: { projectId: 'project-1' },
            take: 20,
            skip: 0,
            order: {},
            withDeleted: false
        }

        await expect(controller.findAll(params)).resolves.toEqual({ items: [task], total: 1 })
        await controller.findMyAll(params)
        await expect(controller.findById('task-1')).resolves.toBe(task)

        expect(service.findHttpAccessible).toHaveBeenNthCalledWith(1, params)
        expect(service.findHttpAccessible).toHaveBeenNthCalledWith(2, params, { createdById: 'user-1' })
        expect(service.findHttpAccessibleById).toHaveBeenCalledWith('task-1', undefined, undefined)
    })

    it('routes every task mutation through the Project-manager HTTP methods', async () => {
        await controller.update('task-1', { name: 'Updated' } as never)
        await controller.schedule('task-1', { status: ScheduleTaskStatus.SCHEDULED } as never)
        await controller.pause('task-1')
        await controller.archive('task-1')
        await controller.unarchive('task-1')
        await controller.test('task-1', 'en' as never, 'UTC')
        await controller.delete('task-1')
        await controller.softRemove('task-1')
        await controller.softRecover('task-1')

        expect(service.updateHttpTask).toHaveBeenCalledWith('task-1', { name: 'Updated' })
        expect(service.scheduleHttpTask).toHaveBeenCalledWith(
            'task-1',
            expect.objectContaining({ status: ScheduleTaskStatus.SCHEDULED })
        )
        expect(service.pauseHttpTask).toHaveBeenCalledWith('task-1')
        expect(service.archiveHttpTask).toHaveBeenCalledWith('task-1')
        expect(service.unarchiveHttpTask).toHaveBeenCalledWith('task-1')
        expect(service.testHttpTask).toHaveBeenCalledWith('task-1', {
            language: 'en',
            timeZone: 'UTC',
            context: undefined
        })
        expect(service.deleteHttpTask).toHaveBeenCalledWith('task-1')
        expect(service.softDeleteHttpTask).toHaveBeenCalledWith('task-1')
        expect(service.recoverHttpTask).toHaveBeenCalledWith('task-1')
    })

    it('routes run-as proposal and acceptance through the explicit confirmation workflow', async () => {
        await controller.proposeRunAs('task-1', { runAsUserId: 'user-2' })
        await controller.acceptRunAs('task-1')

        expect(service.proposeProjectTaskRunAs).toHaveBeenCalledWith('task-1', 'user-2')
        expect(service.acceptProjectTaskRunAs).toHaveBeenCalledWith('task-1')
    })
})
