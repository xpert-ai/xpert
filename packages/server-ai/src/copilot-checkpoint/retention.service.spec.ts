import {
    COPILOT_CHECKPOINT_RETENTION_DAYS_SETTING,
    COPILOT_CHECKPOINT_RETENTION_ENABLED_SETTING,
    DEFAULT_COPILOT_CHECKPOINT_RETENTION_DAYS,
    MAX_COPILOT_CHECKPOINT_RETENTION_DAYS
} from '@xpert-ai/contracts'
import { Repository } from 'typeorm'
import { CopilotCheckpoint } from './copilot-checkpoint.entity'
import { CopilotCheckpointRetentionService } from './retention.service'

type QueryMock = jest.Mock<Promise<unknown[]>, [string, unknown[]?]>

type ManagerMock = {
    query: QueryMock
    transaction: jest.Mock<Promise<unknown>, [(manager: ManagerMock) => Promise<unknown>]>
    connection: {
        createQueryRunner: jest.Mock<QueryRunnerMock, []>
    }
}

type QueryRunnerMock = {
    query: QueryMock
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

function createManager(queryRunner = createQueryRunner()): ManagerMock {
    return {
        query: jest.fn(),
        transaction: jest.fn(),
        connection: {
            createQueryRunner: jest.fn(() => queryRunner)
        }
    }
}

function createService(manager = createManager(), transactionalManager = createManager()) {
    manager.transaction.mockImplementation((run) => run(transactionalManager))

    const repository = {
        manager
    }

    const service = new CopilotCheckpointRetentionService(repository as unknown as Repository<CopilotCheckpoint>)

    return {
        service,
        manager,
        transactionalManager,
        queryRunner: manager.connection.createQueryRunner()
    }
}

describe('CopilotCheckpointRetentionService', () => {
    beforeEach(() => {
        jest.spyOn(Date, 'now').mockReturnValue(1_000)
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('registers scheduled cleanup as a daily cron job', () => {
        const runScheduledCleanup = Reflect.get(CopilotCheckpointRetentionService.prototype, 'runScheduledCleanup')

        expect(typeof runScheduledCleanup).toBe('function')
        const metadata = Reflect.getMetadata(
            'SCHEDULE_CRON_OPTIONS',
            runScheduledCleanup
        )

        expect(metadata).toEqual(expect.objectContaining({ cronTime: '0 0 3 * * *' }))
    })

    it('scheduled cleanup runs execute without dry-run fallback', async () => {
        const { service, queryRunner } = createService()
        const execute = jest.spyOn(service, 'execute').mockResolvedValue({
            deletedCheckpointCount: 0,
            deletedWriteCount: 0,
            batches: 0,
            elapsedMs: 0,
            batchLimitReached: false
        })

        const runScheduledCleanup = Reflect.get(service, 'runScheduledCleanup')
        expect(typeof runScheduledCleanup).toBe('function')
        queryRunner.query.mockResolvedValueOnce([{ locked: true }]).mockResolvedValueOnce([{ unlocked: true }])
        await Reflect.apply(runScheduledCleanup, service, [])

        expect(execute).toHaveBeenCalledTimes(1)
        expect(Reflect.get(service, 'dryRun')).toBeUndefined()
    })

    it('scheduled cleanup skips execute when another instance holds the retention lock', async () => {
        const { service, queryRunner } = createService()
        const execute = jest.spyOn(service, 'execute')
        queryRunner.query.mockResolvedValueOnce([{ locked: false }])

        const runScheduledCleanup = Reflect.get(service, 'runScheduledCleanup')
        expect(typeof runScheduledCleanup).toBe('function')
        await Reflect.apply(runScheduledCleanup, service, [])

        expect(execute).not.toHaveBeenCalled()
        expect(queryRunner.query.mock.calls[0][0]).toContain('pg_try_advisory_lock')
        expect(queryRunner.release).toHaveBeenCalledTimes(1)
    })

    it('scheduled cleanup releases the retention lock after execute', async () => {
        const { service, queryRunner } = createService()
        const execute = jest.spyOn(service, 'execute').mockResolvedValue({
            deletedCheckpointCount: 0,
            deletedWriteCount: 0,
            batches: 0,
            elapsedMs: 0,
            batchLimitReached: false
        })
        queryRunner.query.mockResolvedValueOnce([{ locked: true }]).mockResolvedValueOnce([{ unlocked: true }])

        const runScheduledCleanup = Reflect.get(service, 'runScheduledCleanup')
        expect(typeof runScheduledCleanup).toBe('function')
        await Reflect.apply(runScheduledCleanup, service, [])

        expect(execute).toHaveBeenCalledTimes(1)
        expect(queryRunner.query.mock.calls[0][0]).toContain('pg_try_advisory_lock')
        expect(queryRunner.query.mock.calls[1][0]).toContain('pg_advisory_unlock')
        expect(queryRunner.release).toHaveBeenCalledTimes(1)
    })

    it('does not delete or dry-run when cleanup is disabled for every tenant', async () => {
        const { service, manager } = createService()

        manager.query.mockResolvedValueOnce([])

        const result = await service.execute()

        expect(result).toEqual({
            deletedCheckpointCount: 0,
            deletedWriteCount: 0,
            batches: 0,
            elapsedMs: 0,
            batchLimitReached: false
        })
        expect(manager.transaction).not.toHaveBeenCalled()
        expect(Reflect.get(service, 'dryRun')).toBeUndefined()
    })

    it('executes date-expired cleanup in batches and deletes writes before checkpoints', async () => {
        const { service, manager, transactionalManager } = createService()
        const batchRows = [
            { id: '00000000-0000-0000-0000-000000000001' },
            { id: '00000000-0000-0000-0000-000000000002' }
        ]

        manager.query.mockResolvedValueOnce(batchRows).mockResolvedValueOnce([])
        transactionalManager.query.mockResolvedValueOnce([{ count: '3' }]).mockResolvedValueOnce([{ count: '2' }])

        const result = await service.execute({ batchSize: 2 })

        expect(result).toEqual({
            deletedCheckpointCount: 2,
            deletedWriteCount: 3,
            batches: 1,
            elapsedMs: 0,
            batchLimitReached: false
        })
        expect(manager.query.mock.calls[0][0]).toContain('ORDER BY c."createdAt" ASC')
        expect(manager.query.mock.calls[0][0]).toContain('LIMIT $5::int')
        expect(manager.query.mock.calls[0][0]).toContain('td.value::int <= $4::int')
        expect(manager.query.mock.calls[0][0]).toContain('te.name = $1')
        expect(manager.query.mock.calls[0][0]).toContain("lower(COALESCE(te.value, '')) IN ('1', 'true', 'yes', 'on')")
        expect(manager.query.mock.calls[0][0]).not.toContain('pg_column_size')
        expect(manager.query.mock.calls[0][0]).not.toContain('row_number()')
        expect(manager.query.mock.calls[0][1]).toEqual([
            COPILOT_CHECKPOINT_RETENTION_ENABLED_SETTING,
            COPILOT_CHECKPOINT_RETENTION_DAYS_SETTING,
            DEFAULT_COPILOT_CHECKPOINT_RETENTION_DAYS,
            MAX_COPILOT_CHECKPOINT_RETENTION_DAYS,
            2
        ])
        expect(manager.transaction).toHaveBeenCalledTimes(1)
        expect(transactionalManager.query.mock.calls[0][0]).toContain('DELETE FROM copilot_checkpoint_writes')
        expect(transactionalManager.query.mock.calls[1][0]).toContain('DELETE FROM copilot_checkpoint')
        expect(manager.query.mock.calls.some(([sql]) => sql.includes('NOT EXISTS'))).toBe(false)
    })

    it('scopes write deletion candidates by tenant and organization', async () => {
        const { service, manager, transactionalManager } = createService()

        manager.query.mockResolvedValueOnce([{ id: '00000000-0000-0000-0000-000000000001' }]).mockResolvedValueOnce([])
        transactionalManager.query.mockResolvedValueOnce([{ count: '1' }]).mockResolvedValueOnce([{ count: '1' }])

        await service.execute({ batchSize: 1 })

        expect(manager.query.mock.calls[0][0]).toContain('te."tenantId" IS NOT DISTINCT FROM c."tenantId"')
        expect(manager.query.mock.calls[0][0]).toContain('td."tenantId" IS NOT DISTINCT FROM c."tenantId"')
        expect(transactionalManager.query.mock.calls[0][0]).toContain('"tenantId"')
        expect(transactionalManager.query.mock.calls[0][0]).toContain('"organizationId"')
        expect(transactionalManager.query.mock.calls[0][0]).toContain('w."tenantId" IS NOT DISTINCT FROM c."tenantId"')
        expect(transactionalManager.query.mock.calls[0][0]).toContain(
            'w."organizationId" IS NOT DISTINCT FROM c."organizationId"'
        )
    })

    it('stops cleanup when the per-run batch limit is reached', async () => {
        const { service, manager, transactionalManager } = createService()
        const batchRows = [{ id: '00000000-0000-0000-0000-000000000001' }]

        manager.query.mockResolvedValue(batchRows)
        transactionalManager.query.mockResolvedValueOnce([{ count: '1' }]).mockResolvedValueOnce([{ count: '1' }])

        const result = await service.execute({ batchSize: 1, maxBatchesPerRun: 1 })

        expect(result).toEqual({
            deletedCheckpointCount: 1,
            deletedWriteCount: 1,
            batches: 1,
            elapsedMs: 0,
            batchLimitReached: true
        })
        expect(manager.transaction).toHaveBeenCalledTimes(1)
        expect(manager.query).toHaveBeenCalledTimes(1)
    })

    it('caps oversized batch options to internal batch limits', async () => {
        const { service, manager, transactionalManager } = createService()
        manager.query.mockResolvedValue([{ id: '00000000-0000-0000-0000-000000000001' }])
        transactionalManager.query.mockResolvedValue([{ count: '1' }])

        const result = await service.execute({ batchSize: 50_000, maxBatchesPerRun: 50_000 })

        expect(result).toEqual({
            deletedCheckpointCount: 20,
            deletedWriteCount: 20,
            batches: 20,
            elapsedMs: 0,
            batchLimitReached: true
        })
        expect(manager.query).toHaveBeenCalledTimes(20)
        expect(manager.query.mock.calls[0][1]).toEqual([
            COPILOT_CHECKPOINT_RETENTION_ENABLED_SETTING,
            COPILOT_CHECKPOINT_RETENTION_DAYS_SETTING,
            DEFAULT_COPILOT_CHECKPOINT_RETENTION_DAYS,
            MAX_COPILOT_CHECKPOINT_RETENTION_DAYS,
            1000
        ])
    })

    it('does not report success when a batch transaction fails', async () => {
        const { service, manager, transactionalManager } = createService()

        manager.query.mockResolvedValueOnce([{ id: '00000000-0000-0000-0000-000000000001' }])
        transactionalManager.query.mockRejectedValueOnce(new Error('delete failed'))

        await expect(service.execute({ batchSize: 1 })).rejects.toThrow('delete failed')
    })

})
