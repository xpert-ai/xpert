jest.mock('../entities/project-automation.entity', () => ({
    XpertProjectAutomation: class XpertProjectAutomation {}
}))

jest.mock('./project-automation.service', () => ({
    XpertProjectAutomationService: class XpertProjectAutomationService {}
}))

import { RedisLockRunResult, RedisLockService } from '@xpert-ai/server-core'
import { Repository } from 'typeorm'
import { XpertProjectAutomation } from '../entities/project-automation.entity'
import { XpertProjectAutomationSchedulerService } from './project-automation-scheduler.service'
import { XpertProjectAutomationService } from './project-automation.service'

function createService() {
    const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([])
    }
    const repository = {
        createQueryBuilder: jest.fn(() => queryBuilder),
        save: jest.fn()
    }
    const automationService = {
        run: jest.fn()
    }
    const runWithLock = jest.fn<Promise<RedisLockRunResult<unknown>>, [string, number, () => Promise<unknown>]>(
        async (_key, _ttl, operation) => ({
            acquired: true,
            value: await operation()
        })
    )
    const redisLockService = {
        runWithLock
    }
    const service = new XpertProjectAutomationSchedulerService(
        repository as unknown as Repository<XpertProjectAutomation>,
        automationService as unknown as XpertProjectAutomationService,
        redisLockService as unknown as RedisLockService
    )

    return { queryBuilder, redisLockService, service }
}

describe('XpertProjectAutomationSchedulerService', () => {
    it('does not schedule legacy Project automations', async () => {
        const { queryBuilder, redisLockService, service } = createService()

        await service.scan()

        expect(queryBuilder.getMany).not.toHaveBeenCalled()
        expect(redisLockService.runWithLock).not.toHaveBeenCalled()
    })
})
