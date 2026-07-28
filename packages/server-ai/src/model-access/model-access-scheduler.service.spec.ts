import { DataSource } from 'typeorm'
import { Cache } from 'cache-manager'
import { ModelAccessSchedulerService } from './model-access-scheduler.service'
import { ModelAccessService } from './model-access.service'

type QueryRunnerMock = {
    query: jest.Mock<Promise<unknown>, [string, unknown[]?]>
    connect: jest.Mock<Promise<void>, []>
    release: jest.Mock<Promise<void>, []>
}

function createQueryRunner(): QueryRunnerMock {
    return {
        query: jest.fn(),
        connect: jest.fn().mockResolvedValue(undefined),
        release: jest.fn().mockResolvedValue(undefined)
    }
}

function createService() {
    const queryRunner = createQueryRunner()
    const dataSource = {
        createQueryRunner: jest.fn(() => queryRunner)
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
        dataSource as unknown as DataSource,
        modelAccessService as unknown as ModelAccessService,
        cacheManager as unknown as Cache
    )

    return { service, queryRunner, modelAccessService, cacheManager }
}

describe('ModelAccessSchedulerService', () => {
    it('registers a once-per-minute lifecycle cron job', () => {
        const method = Reflect.get(ModelAccessSchedulerService.prototype, 'expireDueGrants')

        expect(Reflect.getMetadata('SCHEDULE_CRON_OPTIONS', method)).toEqual(
            expect.objectContaining({ cronTime: '0 * * * * *' })
        )
    })

    it('skips reconciliation while another instance holds the advisory lock', async () => {
        const { service, queryRunner, modelAccessService } = createService()
        queryRunner.query.mockResolvedValueOnce([{ locked: false }])

        await service.expireDueGrants()

        expect(modelAccessService.processAllDueGrants).not.toHaveBeenCalled()
        expect(modelAccessService.reconcileLifecycleBatch).not.toHaveBeenCalled()
        expect(queryRunner.release).toHaveBeenCalledTimes(1)
    })

    it('expires grants, reconciles lifecycle state, and releases the advisory lock', async () => {
        const { service, queryRunner, modelAccessService } = createService()
        queryRunner.query.mockResolvedValueOnce([{ locked: true }]).mockResolvedValueOnce([{ unlocked: true }])

        await service.expireDueGrants()

        expect(modelAccessService.processAllDueGrants).toHaveBeenCalledTimes(1)
        expect(modelAccessService.reconcileLifecycleBatch).toHaveBeenCalledWith({
            requestAfterId: null,
            grantAfterId: null,
            limit: 200
        })
        expect(queryRunner.query.mock.calls[1][0]).toContain('pg_advisory_unlock')
        expect(queryRunner.release).toHaveBeenCalledTimes(1)
    })

    it('continues from the shared lifecycle cursor and stores the next batch position', async () => {
        const { service, queryRunner, modelAccessService, cacheManager } = createService()
        queryRunner.query.mockResolvedValueOnce([{ locked: true }]).mockResolvedValueOnce([{ unlocked: true }])
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
