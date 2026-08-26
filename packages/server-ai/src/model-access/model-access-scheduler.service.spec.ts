import { RedisLockRunResult, RedisLockService } from '@xpert-ai/server-core'
import { Cache } from 'cache-manager'
import { ModelAccessSchedulerService } from './model-access-scheduler.service'
import { ModelAccessService } from './model-access.service'

function createService() {
    const runWithLock = jest.fn<Promise<RedisLockRunResult<unknown>>, [string, number, () => Promise<unknown>]>(
        async (_key, _ttl, operation) => ({
            acquired: true,
            value: await operation()
        })
    )
    const redisLockService = {
        runWithLock
    }
    const modelAccessService = {
        processAllDueGrants: jest.fn().mockResolvedValue(1),
        reconcileLifecycleBatch: jest.fn().mockResolvedValue({
            requests: 2,
            grants: 3,
            nextRequestAfterId: 'request-200',
            nextGrantAfterId: 'grant-200'
        })
    }
    const cacheManager = {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue(undefined)
    }
    const service = new ModelAccessSchedulerService(
        modelAccessService as unknown as ModelAccessService,
        cacheManager as unknown as Cache,
        redisLockService as unknown as RedisLockService
    )

    return { service, redisLockService, modelAccessService, cacheManager }
}

describe('ModelAccessSchedulerService', () => {
    it('registers a once-per-minute lifecycle cron job', () => {
        const method = Reflect.get(ModelAccessSchedulerService.prototype, 'expireDueGrants')

        expect(Reflect.getMetadata('SCHEDULE_CRON_OPTIONS', method)).toEqual(
            expect.objectContaining({ cronTime: '0 * * * * *' })
        )
    })

    it('skips reconciliation while another instance holds the Redis lock', async () => {
        const { service, redisLockService, modelAccessService } = createService()
        redisLockService.runWithLock.mockResolvedValueOnce({ acquired: false })

        await service.expireDueGrants()

        expect(modelAccessService.processAllDueGrants).not.toHaveBeenCalled()
        expect(modelAccessService.reconcileLifecycleBatch).not.toHaveBeenCalled()
    })

    it('expires grants and reconciles lifecycle state under a renewable Redis lock', async () => {
        const { service, redisLockService, modelAccessService } = createService()

        await service.expireDueGrants()

        expect(modelAccessService.processAllDueGrants).toHaveBeenCalledTimes(1)
        expect(modelAccessService.reconcileLifecycleBatch).toHaveBeenCalledWith({
            requestAfterId: null,
            grantAfterId: null,
            limit: 200
        })
        expect(redisLockService.runWithLock).toHaveBeenCalledWith(
            'scheduler:model-access-lifecycle',
            5 * 60 * 1000,
            expect.any(Function)
        )
    })

    it('continues from the shared lifecycle cursor and stores the next batch position', async () => {
        const { service, modelAccessService, cacheManager } = createService()
        cacheManager.get.mockResolvedValueOnce({
            requestAfterId: 'request-100',
            grantAfterId: 'grant-100'
        })

        await service.expireDueGrants()

        expect(modelAccessService.reconcileLifecycleBatch).toHaveBeenCalledWith({
            requestAfterId: 'request-100',
            grantAfterId: 'grant-100',
            limit: 200
        })
        expect(cacheManager.set).toHaveBeenCalledWith(
            'model-access:lifecycle-cursor:v1',
            {
                requestAfterId: 'request-200',
                grantAfterId: 'grant-200'
            },
            24 * 60 * 60 * 1000
        )
    })
})
