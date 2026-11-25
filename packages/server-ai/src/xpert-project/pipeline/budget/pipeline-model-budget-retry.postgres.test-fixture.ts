import { Logger } from '@nestjs/common'
import { QueryFailedError, type DataSource } from 'typeorm'
import type { ProjectPipelineContext } from '@xpert-ai/plugin-sdk'
import { XpertProject } from '../../entities/project.entity'
import {
    ProjectPipelineInstanceEntity,
    ProjectPipelineModelReservationEntity,
    ProjectPipelineOperationEntity
} from '../persistence/pipeline.entity'
import type { PipelineModelBudgetCall } from './pipeline-model-budget.command'
import type { ProjectPipelineModelBudgetStore } from './pipeline-model-budget.store'

type Fixture = {
    db: DataSource
    context: ProjectPipelineContext
    native: () => Promise<{
        budget: ProjectPipelineModelBudgetStore
        operation: ProjectPipelineOperationEntity
        call: PipelineModelBudgetCall
    }>
}

// Use the production two-second lock timeout; no simulated SQL errors or edited admission clocks.
export function registerBudgetAdmissionRetryTests(fixture: () => Fixture) {
    it.each(['recover', 'cancel', 'budget'] as const)(
        'rechecks admission after a real project lock timeout (%s)',
        async (change) => {
            const { db, context, native } = fixture()
            const f = await native()
            const blocker = db.createQueryRunner()
            let signalTimeout!: () => void
            const firstTimeout = new Promise<void>((resolve) => (signalTimeout = resolve))
            const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation((message: unknown) => {
                if (
                    message &&
                    typeof message === 'object' &&
                    'event' in message &&
                    message.event === 'pipeline.model.admission.lock_timeout'
                )
                    signalTimeout()
            })
            let pending: Promise<unknown> | undefined
            await blocker.connect()
            try {
                await blocker.startTransaction()
                await blocker.manager.findOneOrFail(XpertProject, {
                    where: { id: context.projectId },
                    lock: { mode: 'pessimistic_write' }
                })
                const admission = f.budget.admit(f.call).then(
                    (value) => ({ ok: true as const, value }),
                    (error: unknown) => ({ ok: false as const, error })
                )
                pending = admission
                await Promise.race([
                    firstTimeout,
                    admission.then(() => {
                        throw new Error('Admission ended before observing a lock timeout')
                    })
                ])
                expect(
                    await db
                        .getRepository(ProjectPipelineModelReservationEntity)
                        .countBy({ operationId: f.operation.id })
                ).toBe(0)
                if (change === 'cancel') {
                    await blocker.manager.update(ProjectPipelineOperationEntity, f.operation.id, {
                        cancelRequestedAt: new Date()
                    })
                } else if (change === 'budget') {
                    await blocker.manager.update(ProjectPipelineInstanceEntity, f.operation.instanceId, {
                        nativeModelBudget: { maxCalls: 2, maxTokens: 1, reservationTokens: 1 }
                    })
                }
                await blocker.commitTransaction()
                const outcome = await admission
                if (change === 'recover') {
                    expect(outcome).toEqual({ ok: true, value: true })
                    expect(
                        await db
                            .getRepository(ProjectPipelineModelReservationEntity)
                            .findBy({ operationId: f.operation.id })
                    ).toMatchObject([{ requestId: f.call.requestId, state: 'held', reservedTokens: '50' }])
                    expect(warn).toHaveBeenCalledWith(
                        expect.objectContaining({ event: 'pipeline.model.admission.recovered' })
                    )
                } else {
                    expect(outcome).toMatchObject({
                        ok: false,
                        error: {
                            response: {
                                code: change === 'cancel' ? 'MODEL_BUDGET_EXECUTION_CLOSED' : 'MODEL_BUDGET_EXCEEDED'
                            }
                        }
                    })
                    expect(
                        await db
                            .getRepository(ProjectPipelineModelReservationEntity)
                            .countBy({ operationId: f.operation.id })
                    ).toBe(0)
                }
                expect(warn).toHaveBeenCalledWith(
                    expect.objectContaining({
                        event: 'pipeline.model.admission.lock_timeout',
                        executionId: f.call.executionId,
                        requestId: f.call.requestId,
                        attempt: 1,
                        retry: true
                    })
                )
            } finally {
                if (blocker.isTransactionActive) await blocker.rollbackTransaction()
                await blocker.release()
                await pending
                warn.mockRestore()
            }
        },
        20_000
    )

    it('stops after three real lock timeouts without reserving any model budget', async () => {
        const { db, context, native } = fixture()
        const f = await native()
        const blocker = db.createQueryRunner()
        const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
        await blocker.connect()
        try {
            await blocker.startTransaction()
            await blocker.manager.findOneOrFail(XpertProject, {
                where: { id: context.projectId },
                lock: { mode: 'pessimistic_write' }
            })
            await expect(f.budget.admit(f.call)).rejects.toBeInstanceOf(QueryFailedError)
            for (const attempt of [1, 2, 3]) {
                expect(warn).toHaveBeenCalledWith({
                    event: 'pipeline.model.admission.lock_timeout',
                    executionId: f.call.executionId,
                    requestId: f.call.requestId,
                    attempt,
                    retry: attempt < 3
                })
            }
            expect(warn).toHaveBeenCalledTimes(3)
            expect(
                await db.getRepository(ProjectPipelineModelReservationEntity).countBy({ operationId: f.operation.id })
            ).toBe(0)
        } finally {
            if (blocker.isTransactionActive) await blocker.rollbackTransaction()
            await blocker.release()
            warn.mockRestore()
        }
    }, 20_000)
}
