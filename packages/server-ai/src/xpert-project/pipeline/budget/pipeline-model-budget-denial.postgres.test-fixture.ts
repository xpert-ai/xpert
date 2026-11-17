import { randomUUID } from 'node:crypto'
import type { DataSource } from 'typeorm'
import type { ProjectPipelineContext } from '@xpert-ai/plugin-sdk'
import type { PipelineModelBudgetCall } from './pipeline-model-budget.command'
import type { ProjectPipelineModelBudgetStore } from './pipeline-model-budget.store'
import { pipelineModelBudgetDenials, readPipelineModelBudgetDenial } from './pipeline-model-budget-denial'
import {
    ProjectPipelineEventEntity,
    ProjectPipelineModelReservationEntity,
    type ProjectPipelineOperationEntity
} from '../persistence/pipeline.entity'
import { managedAudit } from '../runtime/pipeline-transaction'

// Registered by pipeline-model-budget.postgres.spec.ts against its disposable PostgreSQL fixture.
export function registerBudgetDenialOrderingTests(
    fixture: () => {
        db: DataSource
        context: ProjectPipelineContext
        native: (
            maxCalls: number,
            maxTokens: number,
            reservationTokens: number
        ) => Promise<{
            budget: ProjectPipelineModelBudgetStore
            operation: ProjectPipelineOperationEntity
            call: PipelineModelBudgetCall
        }>
    }
) {
    describe('budget denial ordering', () => {
        it.each(['admit', 'deny'] as const)(
            'uses write order when an earlier-started transaction is the last to %s',
            async (last) => {
                const { db, context, native } = fixture()
                const f = await native(10, 100, 10)
                const older = db.createQueryRunner()
                await older.connect()
                await older.startTransaction()
                try {
                    await older.query('SELECT now()')
                    await new Promise((resolve) => setTimeout(resolve, 30))
                    const admit = () => f.budget.admit({ ...f.call, requestId: randomUUID(), estimatedTokens: 10 })
                    const deny = () =>
                        expect(
                            f.budget.admit({ ...f.call, requestId: randomUUID(), estimatedTokens: 101 })
                        ).rejects.toMatchObject({ response: { code: 'MODEL_BUDGET_EXCEEDED' } })
                    if (last === 'admit') await deny()
                    else await admit()
                    // Run the real admission path on the already-open transaction, including the Project lock.
                    const transaction = jest
                        .spyOn(db, 'transaction')
                        .mockImplementationOnce(older.manager.transaction.bind(older.manager))
                    try {
                        if (last === 'admit') await admit()
                        else await deny()
                    } finally {
                        transaction.mockRestore()
                    }
                    await older.commitTransaction()
                    const reservation = await db.manager.findOneByOrFail(ProjectPipelineModelReservationEntity, {
                        operationId: f.operation.id
                    })
                    const denial = await db.manager.findOneByOrFail(ProjectPipelineEventEntity, {
                        instanceId: f.operation.instanceId,
                        type: 'model.admission_denied'
                    })
                    expect(reservation.createdAt < denial.createdAt).toBe(last === 'admit')
                    expect(await readPipelineModelBudgetDenial(db.manager, context, f.operation.id)).toBe(
                        last === 'admit' ? null : 'MODEL_BUDGET_EXCEEDED'
                    )
                    expect(await pipelineModelBudgetDenials(db.manager, context, [f.operation])).toHaveLength(
                        last === 'admit' ? 0 : 1
                    )
                } finally {
                    if (older.isTransactionActive) await older.rollbackTransaction()
                    await older.release()
                }
            }
        )

        it('keeps distinct denial cycles with identical timestamps and coalesces repeated observations', async () => {
            const { db, context, native } = fixture()
            const f = await native(10, 100, 10)
            const events = db.getRepository(ProjectPipelineEventEntity)
            const reservations = db.getRepository(ProjectPipelineModelReservationEntity)
            const where = { instanceId: f.operation.instanceId }
            const timestamp = new Date('2026-01-01T00:00:00Z')
            const admit = () => f.budget.admit({ ...f.call, requestId: randomUUID(), estimatedTokens: 10 })
            const deny = () =>
                expect(f.budget.admit({ ...f.call, requestId: randomUUID(), estimatedTokens: 101 })).rejects.toThrow()
            for (let cycle = 1; cycle <= 2; cycle++) {
                await deny()
                await events.update(where, { createdAt: timestamp })
                await reservations.update(where, { createdAt: timestamp })
                await deny()
                expect(await events.countBy({ ...where, type: 'model.admission_denied' })).toBe(cycle)
                expect(await readPipelineModelBudgetDenial(db.manager, context, f.operation.id)).toBe(
                    'MODEL_BUDGET_EXCEEDED'
                )
                expect(await pipelineModelBudgetDenials(db.manager, context, [f.operation])).toHaveLength(1)
                await admit()
                await events.update(where, { createdAt: timestamp })
                await reservations.update(where, { createdAt: timestamp })
                expect(await events.countBy({ ...where, type: 'model.admission_resumed' })).toBe(cycle)
                expect(await readPipelineModelBudgetDenial(db.manager, context, f.operation.id)).toBeNull()
                expect(await pipelineModelBudgetDenials(db.manager, context, [f.operation])).toEqual([])
            }
            await admit()
            expect(await events.countBy({ ...where, type: 'model.admission_resumed' })).toBe(2)
            expect(await reservations.countBy(where)).toBe(3)
        })

        it.each([false, true])(
            'preserves legacy denial state (resolved=%s) until a real new admission',
            async (resolved) => {
                const { db, context, native } = fixture()
                const f = await native(10, 100, 10)
                await expect(f.budget.admit({ ...f.call, estimatedTokens: 101 })).rejects.toThrow()
                const denial = await db.manager.findOneByOrFail(ProjectPipelineEventEntity, {
                    instanceId: f.operation.instanceId,
                    type: 'model.admission_denied'
                })
                const { modelAdmissionVersion, ...legacyPayload } = denial.payload
                await db.manager.update(ProjectPipelineEventEntity, denial.id, { payload: legacyPayload })
                if (resolved) {
                    await db.manager.save(ProjectPipelineModelReservationEntity, {
                        ...managedAudit(context),
                        instanceId: f.operation.instanceId,
                        operationId: f.operation.id,
                        executionId: f.call.executionId,
                        requestId: randomUUID(),
                        state: 'held',
                        reservedTokens: '10',
                        actualTokens: null,
                        createdAt: new Date(denial.createdAt.getTime() + 1)
                    })
                }
                expect(await readPipelineModelBudgetDenial(db.manager, context, f.operation.id)).toBe(
                    resolved ? null : 'MODEL_BUDGET_EXCEEDED'
                )
                await f.budget.admit({ ...f.call, estimatedTokens: 10 })
                expect(await readPipelineModelBudgetDenial(db.manager, context, f.operation.id)).toBeNull()
                expect(
                    await db.manager.countBy(ProjectPipelineEventEntity, {
                        instanceId: f.operation.instanceId,
                        type: 'model.admission_resumed'
                    })
                ).toBe(1)
                expect(
                    (await db.manager.findOneByOrFail(ProjectPipelineEventEntity, { id: denial.id })).payload
                ).toEqual(legacyPayload)
            }
        )
    })
}
