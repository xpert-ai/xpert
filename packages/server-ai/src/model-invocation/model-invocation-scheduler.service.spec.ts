import type { DataSource } from 'typeorm'
import { ModelInvocationReconciliationService } from './model-invocation-reconciliation.service'
import { ModelInvocationSchedulerService } from './model-invocation-scheduler.service'

describe('ModelInvocationSchedulerService', () => {
    it('runs reconciliation only while holding the cross-instance advisory lock', async () => {
        const queryRunner = {
            connect: jest.fn().mockResolvedValue(undefined),
            query: jest
                .fn()
                .mockResolvedValueOnce([{ locked: true }])
                .mockResolvedValueOnce([{ unlocked: true }]),
            release: jest.fn().mockResolvedValue(undefined)
        }
        const dataSource = { createQueryRunner: jest.fn(() => queryRunner) }
        const reconciliation = {
            markStaleUnboundInvocations: jest.fn().mockResolvedValue(1),
            enqueueDueBatch: jest.fn().mockResolvedValue(3)
        }
        const service = new ModelInvocationSchedulerService(
            dataSource as unknown as DataSource,
            reconciliation as unknown as ModelInvocationReconciliationService
        )

        await service.reconcilePendingInvocations()

        expect(reconciliation.markStaleUnboundInvocations).toHaveBeenCalledWith(25)
        expect(reconciliation.enqueueDueBatch).toHaveBeenCalledWith(25)
        expect(queryRunner.query.mock.calls[1][0]).toContain('pg_advisory_unlock')
        expect(queryRunner.release).toHaveBeenCalledTimes(1)
    })

    it('does nothing when another instance owns the advisory lock', async () => {
        const queryRunner = {
            connect: jest.fn().mockResolvedValue(undefined),
            query: jest.fn().mockResolvedValue([{ locked: false }]),
            release: jest.fn().mockResolvedValue(undefined)
        }
        const dataSource = { createQueryRunner: jest.fn(() => queryRunner) }
        const reconciliation = { markStaleUnboundInvocations: jest.fn(), enqueueDueBatch: jest.fn() }
        const service = new ModelInvocationSchedulerService(
            dataSource as unknown as DataSource,
            reconciliation as unknown as ModelInvocationReconciliationService
        )

        await service.reconcilePendingInvocations()

        expect(reconciliation.markStaleUnboundInvocations).not.toHaveBeenCalled()
        expect(reconciliation.enqueueDueBatch).not.toHaveBeenCalled()
        expect(queryRunner.release).toHaveBeenCalledTimes(1)
    })
})
