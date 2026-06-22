import { Repository } from 'typeorm'
import { CopilotCheckpoint } from './copilot-checkpoint.entity'
import { CopilotCheckpointRetentionService } from './retention.service'
import { CopilotCheckpointWrites } from './writes/writes.entity'

type QueryMock = jest.Mock<Promise<unknown[]>, [string, unknown[]?]>

type QueryRunnerMock = {
    query: QueryMock
    connect: jest.Mock<Promise<void>, []>
    release: jest.Mock<Promise<void>, []>
}

type ManagerMock = {
    query: QueryMock
    transaction: jest.Mock<Promise<unknown>, [(manager: ManagerMock) => Promise<unknown>]>
    connection: {
        createQueryRunner: jest.Mock<QueryRunnerMock, []>
    }
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

    const service = new CopilotCheckpointRetentionService(
        repository as unknown as Repository<CopilotCheckpoint>,
        repository as unknown as Repository<CopilotCheckpointWrites>
    )

    return {
        service,
        manager,
        transactionalManager,
        queryRunner: manager.connection.createQueryRunner()
    }
}

describe('CopilotCheckpointRetentionService', () => {
    const originalEnv = process.env

    beforeEach(() => {
        process.env = { ...originalEnv }
        jest.spyOn(Date, 'now').mockReturnValue(1_000)
    })

    afterEach(() => {
        process.env = originalEnv
        jest.restoreAllMocks()
    })

    it('registers scheduled cleanup as a daily cron job', () => {
        const metadata = Reflect.getMetadata(
            'SCHEDULE_CRON_OPTIONS',
            CopilotCheckpointRetentionService.prototype.runScheduledCleanup
        )

        expect(metadata).toEqual(expect.objectContaining({ cronTime: '0 0 3 * * *' }))
    })

    it('dry run reports cleanup impact without deleting rows', async () => {
        const { service, manager } = createService()

        manager.query.mockImplementation(async (sql) => {
            if (sql.includes('FROM delete_candidates')) {
                return [
                    {
                        checkpointCount: '12',
                        writesCount: '34',
                        estimatedBytes: '987654321'
                    }
                ]
            }

            if (sql.includes('thread_id AS "threadId"')) {
                return [
                    {
                        organizationId: 'org-1',
                        threadId: 'thread-large',
                        checkpointNs: '',
                        checkpointCount: '250',
                        checkpointBytes: '4294967296',
                        writesBytes: '2147483648',
                        threadBytes: '6442450944'
                    }
                ]
            }

            throw new Error(`Unexpected query: ${sql}`)
        })

        const result = await service.dryRun()

        expect(result).toEqual({
            mode: 'dry-run',
            checkpointCount: 12,
            writesCount: 34,
            estimatedBytes: 987654321,
            oversizedThreads: [
                {
                    organizationId: 'org-1',
                    threadId: 'thread-large',
                    checkpointNs: '',
                    checkpointCount: 250,
                    checkpointBytes: 4294967296,
                    writesBytes: 2147483648,
                    threadBytes: 6442450944
                }
            ]
        })
        expect(manager.transaction).not.toHaveBeenCalled()
        expect(manager.query.mock.calls.some(([sql]) => sql.includes('DELETE'))).toBe(false)
        expect(manager.query.mock.calls[0][0]).toContain('r.thread_bytes < $3::bigint')
        expect(manager.query.mock.calls[0][0]).toContain('r.thread_bytes >= $3::bigint AND r.rn > $2::int')
        expect(manager.query.mock.calls[0][0]).toContain('r."createdAt" < now() - make_interval(days => $1::int)')
        expect(manager.query.mock.calls[0][0]).not.toContain('r.rn > $4::int')
        expect(manager.query.mock.calls[0][0]).not.toContain('r.row_bytes >')
        expect(manager.query.mock.calls[0][0]).not.toContain('AND (\n\t\t\tOR')
        expect(manager.query.mock.calls[0][1]).toEqual([60, 10, 5368709120])
        expect(manager.query.mock.calls[1][1]).toEqual([5368709120, 20])
    })

    it('executes cleanup in batches and deletes writes before checkpoints', async () => {
        const { service, manager, transactionalManager } = createService()
        const batchRows = [
            { id: '00000000-0000-0000-0000-000000000001' },
            { id: '00000000-0000-0000-0000-000000000002' }
        ]

        manager.query
            .mockResolvedValueOnce(batchRows)
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ count: '1' }])
        transactionalManager.query.mockResolvedValueOnce([{ count: '3' }]).mockResolvedValueOnce([{ count: '2' }])

        const result = await service.execute({ batchSize: 2 })

        expect(result).toEqual({
            mode: 'execute',
            deletedCheckpointCount: 2,
            deletedWriteCount: 3,
            orphanWriteCount: 1,
            batches: 1,
            elapsedMs: 0,
            batchLimitReached: false
        })
        expect(manager.transaction).toHaveBeenCalledTimes(1)
        expect(transactionalManager.query.mock.calls[0][0]).toContain('DELETE FROM copilot_checkpoint_writes')
        expect(transactionalManager.query.mock.calls[1][0]).toContain('DELETE FROM copilot_checkpoint')
    })

    it('scopes write deletion candidates by tenant', async () => {
        const { service, manager, transactionalManager } = createService()

        manager.query
            .mockResolvedValueOnce([{ id: '00000000-0000-0000-0000-000000000001' }])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ count: '0' }])
        transactionalManager.query.mockResolvedValueOnce([{ count: '1' }]).mockResolvedValueOnce([{ count: '1' }])

        await service.execute({ batchSize: 1 })

        expect(manager.query.mock.calls[0][0]).toContain('c."tenantId"')
        expect(manager.query.mock.calls[0][0]).toContain('w."tenantId"')
        expect(manager.query.mock.calls[0][0]).toContain('ts."tenantId" IS NOT DISTINCT FROM c."tenantId"')
        expect(transactionalManager.query.mock.calls[0][0]).toContain('"tenantId"')
        expect(transactionalManager.query.mock.calls[0][0]).toContain('w."tenantId" IS NOT DISTINCT FROM c."tenantId"')
    })

    it('stops cleanup when the per-run batch limit is reached', async () => {
        const { service, manager, transactionalManager } = createService()
        const batchRows = [{ id: '00000000-0000-0000-0000-000000000001' }]

        manager.query.mockResolvedValue(batchRows)
        transactionalManager.query.mockResolvedValueOnce([{ count: '1' }]).mockResolvedValueOnce([{ count: '1' }])

        const result = await service.execute({ batchSize: 1, maxBatchesPerRun: 1 })

        expect(result).toEqual({
            mode: 'execute',
            deletedCheckpointCount: 1,
            deletedWriteCount: 1,
            orphanWriteCount: 0,
            batches: 1,
            elapsedMs: 0,
            batchLimitReached: true
        })
        expect(manager.transaction).toHaveBeenCalledTimes(1)
        expect(manager.query.mock.calls.some(([sql]) => sql.includes('DELETE FROM copilot_checkpoint_writes w'))).toBe(
            false
        )
    })

    it('does not report success when a batch transaction fails', async () => {
        const { service, manager, transactionalManager } = createService()

        manager.query.mockResolvedValueOnce([{ id: '00000000-0000-0000-0000-000000000001' }])
        transactionalManager.query.mockRejectedValueOnce(new Error('delete failed'))

        await expect(service.execute({ batchSize: 1 })).rejects.toThrow('delete failed')
    })

    it('scheduled cleanup skips dry-run unless execute is explicitly enabled', async () => {
        const { service, queryRunner } = createService()
        const dryRun = jest.spyOn(service, 'dryRun')
        const execute = jest.spyOn(service, 'execute').mockResolvedValue({
            mode: 'execute',
            deletedCheckpointCount: 0,
            deletedWriteCount: 0,
            orphanWriteCount: 0,
            batches: 0,
            elapsedMs: 0,
            batchLimitReached: false
        })

        delete process.env.COPILOT_CHECKPOINT_RETENTION_EXECUTE_ENABLED
        queryRunner.query.mockResolvedValue([{ locked: true }])
        await service.runScheduledCleanup()
        expect(queryRunner.connect).not.toHaveBeenCalled()
        expect(dryRun).not.toHaveBeenCalled()
        expect(execute).not.toHaveBeenCalled()

        process.env.COPILOT_CHECKPOINT_RETENTION_EXECUTE_ENABLED = 'false'
        await service.runScheduledCleanup()
        expect(queryRunner.connect).not.toHaveBeenCalled()
        expect(dryRun).not.toHaveBeenCalled()
        expect(execute).not.toHaveBeenCalled()

        process.env.COPILOT_CHECKPOINT_RETENTION_EXECUTE_ENABLED = 'true'
        dryRun.mockResolvedValueOnce({
            mode: 'dry-run',
            checkpointCount: 1,
            writesCount: 1,
            estimatedBytes: 1024,
            oversizedThreads: []
        })
        await service.runScheduledCleanup()
        expect(dryRun).toHaveBeenCalledTimes(1)
        expect(execute).not.toHaveBeenCalled()

        dryRun.mockResolvedValueOnce({
            mode: 'dry-run',
            checkpointCount: 1,
            writesCount: 1,
            estimatedBytes: 1024,
            oversizedThreads: [
                {
                    organizationId: 'org-1',
                    threadId: 'thread-large',
                    checkpointNs: '',
                    checkpointCount: 1,
                    checkpointBytes: 1,
                    writesBytes: 1,
                    threadBytes: 2
                }
            ]
        })
        await service.runScheduledCleanup()
        expect(execute).toHaveBeenCalledTimes(1)
    })

    it('scheduled cleanup skips when another instance holds the retention lock', async () => {
        const { service, queryRunner } = createService()
        const dryRun = jest.spyOn(service, 'dryRun')

        process.env.COPILOT_CHECKPOINT_RETENTION_EXECUTE_ENABLED = 'true'
        queryRunner.query.mockResolvedValueOnce([{ locked: false }])

        await service.runScheduledCleanup()

        expect(dryRun).not.toHaveBeenCalled()
    })

    it('scheduled cleanup releases the retention lock on the same query runner connection', async () => {
        const { service, queryRunner } = createService()
        const dryRun = jest.spyOn(service, 'dryRun').mockResolvedValue({
            mode: 'dry-run',
            checkpointCount: 0,
            writesCount: 0,
            estimatedBytes: 0,
            oversizedThreads: []
        })

        process.env.COPILOT_CHECKPOINT_RETENTION_EXECUTE_ENABLED = 'true'
        queryRunner.query.mockResolvedValueOnce([{ locked: true }]).mockResolvedValueOnce([{ unlocked: true }])

        await service.runScheduledCleanup()

        expect(dryRun).toHaveBeenCalledTimes(1)
        expect(queryRunner.connect).toHaveBeenCalledTimes(1)
        expect(queryRunner.query.mock.calls[0][0]).toContain('pg_try_advisory_lock')
        expect(queryRunner.query.mock.calls[1][0]).toContain('pg_advisory_unlock')
        expect(queryRunner.release).toHaveBeenCalledTimes(1)
    })
}
