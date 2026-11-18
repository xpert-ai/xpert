import { randomUUID } from 'node:crypto'
import {
    TaskControlPublication,
    ExecutionTaskControl,
    readHandoffReceipt,
    controlAdmissionUnavailable
} from '@xpert-ai/server-core'
import type { ProcessResult } from '@xpert-ai/plugin-sdk'
import { HANDOFF_CONTROL_HANDLER } from './handoff-publication'
import { controlledHandoffFixture, until } from './testing/controlled-handoff.fixture'

const url = process.env.XPERT_PAUSE_TEST_DATABASE_URL,
    redisUrl = process.env.XPERT_CONTROL_TEST_REDIS_URL
const integration = url && redisUrl ? describe : describe.skip
integration('controlled Handoff through real Managed Queue admission and durable receipts', () => {
    let f: Awaited<ReturnType<typeof controlledHandoffFixture>>
    beforeEach(async () => {
        f = await controlledHandoffFixture(url, redisUrl)
    })
    afterEach(async () => {
        await f?.close()
    })
    async function setup(result: ProcessResult = { status: 'ok' }) {
        const body = jest.fn(async () => result),
            service = f.service(body),
            parent = await f.parent(),
            message = f.message()
        await f.ready()
        return { body, service, parent, message, enqueue: () => f.owned(parent.id, () => service.enqueue(message)) }
    }
    async function due() {
        await f.database
            .getRepository(TaskControlPublication)
            .createQueryBuilder()
            .update()
            .set({ nextAttemptAt: new Date(0) })
            .execute()
        await f.ready()
    }

    it('advertises and admits the exact contract; child callbacks settle the family and survive duplicate delivery on another worker', async () => {
        const x = await setup(),
            child = await f.parent(x.parent.id)
        expect(f.registry.controlHandlers()).toEqual([{ ...HANDOFF_CONTROL_HANDLER, scopeKey: null }])
        await f.owned(child.id, () => x.service.enqueue(x.message))
        const callback = await f.store.find(f.scope, 'handoff', x.message.id)
        expect(callback.parentId).toBe(child.id)
        const job = await f.queue.getJob(`handoff-v2-${x.message.id}`)
        expect(job.data).toMatchObject({ controlProtocol: 3, controlContract: HANDOFF_CONTROL_HANDLER.controlContract })
        expect(await f.legacy.getWaitingCount()).toBe(0)
        await f.worker()
        await until(async () => (await job.getState()) === 'completed')
        expect(await f.store.read(callback.id)).toMatchObject({ state: 'completed', outcome: 'succeeded', claim: null })
        const receipt = readHandoffReceipt((await f.store.publication(callback.id)).result)
        expect(receipt).toMatchObject({
            outcome: 'succeeded',
            workerId: job.data.control.targetId,
            result: { status: 'ok' }
        })
        await f.store.receipt(child.id, 'completed')
        expect(await f.store.settled(x.parent.id, false)).toBe(true)
        const second = await f.worker()
        await second.processor.process(job)
        expect(x.body).toHaveBeenCalledTimes(1)
    })

    it('lets an admitted synchronous child drain during pause and returns a durable result to a different caller replica', async () => {
        const x = await setup(),
            caller = f.service(x.body, false)
        const waiting = f.owned(x.parent.id, () => caller.enqueueAndWait(x.message, { timeoutMs: 10000 }))
        await until(async () => (await f.queue.getWaitingCount()) === 1)
        await f.store.change(x.parent.id, 'paused')
        expect(await f.store.settled(x.parent.id, true)).toBe(false)
        await f.worker()
        await expect(waiting).resolves.toEqual({ status: 'ok' })
        await until(() => f.store.settled(x.parent.id, true))
        expect(x.body).toHaveBeenCalledTimes(1)
    })

    it('retains an asynchronous child while paused and cancels before callback admission', async () => {
        const x = await setup()
        await x.enqueue()
        await f.store.change(x.parent.id, 'paused')
        await f.worker()
        const job = await f.queue.getJob(`handoff-v2-${x.message.id}`)
        await until(async () => (await job.getState()) === 'delayed')
        expect(x.body).not.toHaveBeenCalled()
        await f.store.change(x.parent.id, 'terminated')
        await job.promote()
        await until(async () => (await job.getState()) === 'completed')
        const task = await f.store.find(f.scope, 'handoff', x.message.id)
        expect(await f.store.settleUnstarted(task.id)).toBe(true)
        expect(x.body).not.toHaveBeenCalled()
        expect(await f.store.settled(x.parent.id, false)).toBe(true)
    })

    it('records worker unavailability, then a restarted publisher uses v3 when a matching consumer reports readiness', async () => {
        const x = await setup()
        x.service.onModuleDestroy()
        await f.ready()
        await x.enqueue()
        const task = await f.store.find(f.scope, 'handoff', x.message.id)
        expect((await f.store.publication(task.id)).diagnostic).toMatchObject({ code: 'worker', retryable: true })
        expect(await f.queue.getWaitingCount()).toBe(0)
        const restarted = f.service(x.body)
        await due()
        await Promise.all([restarted.reconcileControlledPublications(), x.service.reconcileControlledPublications()])
        expect(await f.queue.getWaitingCount()).toBe(1)
        await f.worker()
        await until(() => f.store.settled(x.parent.id, false))
        expect(x.body).toHaveBeenCalledTimes(1)
        expect((await f.store.publication(task.id)).diagnostic).toBeNull()
    })

    it('retains a permanent contract failure and does not repeatedly republish it', async () => {
        const x = await setup()
        const enqueue = jest.spyOn(f.managed, 'enqueue').mockRejectedValue(controlAdmissionUnavailable('handler'))
        await expect(x.enqueue()).rejects.toMatchObject({ response: { reason: 'handler' } })
        const task = await f.store.find(f.scope, 'handoff', x.message.id)
        expect((await f.store.publication(task.id)).diagnostic).toMatchObject({ code: 'handler', retryable: false })
        await due()
        await x.service.reconcileControlledPublications()
        expect(enqueue).toHaveBeenCalledTimes(1)
        expect(await f.store.settled(x.parent.id, false)).toBe(false)
    })

    it('republishes a failed Redis outbox after restart without rerunning the callback', async () => {
        const x = await setup()
        jest.spyOn(f.queue, 'add').mockRejectedValueOnce(new Error('Redis unavailable'))
        await x.enqueue()
        expect(await f.queue.getWaitingCount()).toBe(0)
        await due()
        await Promise.all([f.managed.reconcilePublications(), f.managed.reconcilePublications()])
        await f.worker()
        await until(() => f.store.settled(x.parent.id, false))
        expect(x.body).toHaveBeenCalledTimes(1)
    })

    it('retries receipt persistence only and keeps the family busy until that receipt is durable', async () => {
        const x = await setup()
        const persist = jest.spyOn(f.store, 'recordHandoffReceipt').mockRejectedValueOnce(new Error('DB unavailable'))
        await x.enqueue()
        await f.worker()
        const job = await f.queue.getJob(`handoff-v2-${x.message.id}`)
        await until(async () => (await job.getState()) === 'completed')
        const task = await f.store.find(f.scope, 'handoff', x.message.id)
        expect(await f.store.settleHandoffReceipt(task.id)).toBe(false)
        expect(await f.store.settled(x.parent.id, false)).toBe(false)
        await x.service.reconcileControlledPublications()
        expect(await f.store.settled(x.parent.id, false)).toBe(true)
        expect(persist).toHaveBeenCalledTimes(2)
        expect(x.body).toHaveBeenCalledTimes(1)
    })

    it.each<ProcessResult>([
        { status: 'retry', delayMs: 100 },
        { status: 'dead', reason: 'rejected' }
    ])('keeps callback outcome %j distinct from transport success', async (result) => {
        const x = await setup(result)
        await x.enqueue()
        await f.worker()
        const job = await f.queue.getJob(`handoff-v2-${x.message.id}`)
        await until(async () => (await job.getState()) === 'completed')
        const task = await f.store.find(f.scope, 'handoff', x.message.id)
        await f.store.settleHandoffReceipt(task.id)
        expect(await f.store.read(task.id)).toMatchObject(
            result.status === 'retry' ? { state: 'unknown', outcome: null } : { state: 'completed', outcome: 'failed' }
        )
        expect(await f.store.settled(x.parent.id, false)).toBe(result.status !== 'retry')
        const second = await f.worker()
        await second.processor.process(job)
        expect(x.body).toHaveBeenCalledTimes(1)
    })

    it('does not replay or settle an uncertain callback after the original replica disappears', async () => {
        const x = await setup()
        jest.spyOn(f.store, 'recordHandoffReceipt').mockRejectedValue(new Error('DB unavailable'))
        await x.enqueue()
        await f.worker()
        const job = await f.queue.getJob(`handoff-v2-${x.message.id}`)
        await until(async () => (await job.getState()) === 'completed')
        x.service.onModuleDestroy()
        const restarted = f.service(x.body)
        await restarted.reconcileControlledPublications()
        const task = await f.store.find(f.scope, 'handoff', x.message.id)
        expect(await f.store.settleHandoffReceipt(task.id)).toBe(false)
        expect(await f.store.settled(x.parent.id, false)).toBe(false)
        expect(x.body).toHaveBeenCalledTimes(1)
    })

    it('settles a persisted receipt after restart, while rejecting stale or foreign claims', async () => {
        const x = await setup()
        await x.enqueue()
        await f.worker()
        await until(() => f.store.settled(x.parent.id, false))
        const task = await f.store.find(f.scope, 'handoff', x.message.id)
        const receipt = readHandoffReceipt((await f.store.publication(task.id)).result)
        // Simulate a historical interrupted receipt application, retaining its original token.
        await f.database
            .getRepository(ExecutionTaskControl)
            .update(task.id, { state: 'running', claim: receipt.workerClaim })
        expect(await f.store.settleHandoffReceipt(task.id)).toBe(true)
        await expect(
            f.store.recordHandoffReceipt(task.id, { ...receipt, workerId: randomUUID() })
        ).rejects.toMatchObject({ reason: 'scope' })
        await expect(
            f.store.recordHandoffReceipt(task.id, { ...receipt, workerClaim: randomUUID() })
        ).rejects.toMatchObject({ reason: 'scope' })
        expect(x.body).toHaveBeenCalledTimes(1)
    })

    it('quarantines legacy outboxes instead of inferring completion or replaying them', async () => {
        const x = await setup()
        const task = await f.store.publish(
            { ...f.scope, kind: 'handoff', resourceId: x.message.id, parent: { version: 2, targetId: x.parent.id } },
            { message: x.message, delayMs: 0, drainOnPause: false }
        )
        await x.service.reconcileControlledPublications()
        expect((await f.store.publication(task.id)).diagnostic).toMatchObject({
            code: 'legacy_review',
            retryable: false
        })
        expect(await f.queue.getWaitingCount()).toBe(0)
        expect(await f.store.settled(x.parent.id, false)).toBe(false)
    })
    it('preserves a successful return after cancellation without releasing the family while the callback is active', async () => {
        let entered!: () => void, release!: () => void
        const started = new Promise<void>((resolve) => {
            entered = resolve
        })
        const gate = new Promise<void>((resolve) => {
            release = resolve
        })
        const body = jest.fn(async (_message, context) => {
            entered()
            await gate
            expect(context.abortSignal.aborted).toBe(true)
            return { status: 'ok' as const }
        })
        const service = f.service(body),
            parent = await f.parent(),
            message = f.message()
        await f.ready()
        await f.owned(parent.id, () => service.enqueue(message))
        const worker = await f.worker()
        await started
        await f.store.change(parent.id, 'terminated')
        await worker.runner.reconcile()
        const task = await f.store.find(f.scope, 'handoff', message.id)
        expect(await f.store.settleUnstarted(task.id)).toBe(false)
        expect(await f.store.settled(parent.id, false)).toBe(false)
        release()
        await until(() => f.store.settled(parent.id, false))
        expect(readHandoffReceipt((await f.store.publication(task.id)).result)).toMatchObject({ outcome: 'succeeded' })
        expect(body).toHaveBeenCalledTimes(1)
    })

    it('retains an uncertain throw without leaking the exception into receipts or replaying business work', async () => {
        const body = jest.fn(async () => {
            throw new Error('private provider response')
        })
        const service = f.service(body),
            parent = await f.parent(),
            message = f.message()
        await f.ready()
        await f.owned(parent.id, () => service.enqueue(message))
        await f.worker()
        const task = await f.store.find(f.scope, 'handoff', message.id)
        await until(async () => (await f.store.read(task.id)).state === 'unknown')
        expect(JSON.stringify((await f.store.publication(task.id)).result)).not.toContain('private provider response')
        expect((await f.store.inspectHandoff(f.scope, task.id)).evidence).toBe('uncertain')
        expect(await f.store.settleHandoffReceipt(task.id)).toBe(false)
        expect(body).toHaveBeenCalledTimes(1)
    })

    it('repairs only exact legacy terminal results corroborated by a successful worker exit, under scope and revision checks', async () => {
        const x = await setup()
        const task = await f.store.publish(
            { ...f.scope, kind: 'handoff', resourceId: x.message.id, parent: { version: 2, targetId: x.parent.id } },
            { message: x.message, delayMs: 0, drainOnPause: false }
        )
        const worker = await f.store.register({
            ...f.scope,
            kind: 'managed-queue',
            resourceId: randomUUID(),
            parent: { version: 2, targetId: task.id }
        })
        const claim = await f.store.claim(worker.id)
        await f.store.publicationResult(task.id, { status: 'ok' })
        expect((await f.store.inspectHandoff(f.scope, task.id)).evidence).toBe('uncertain')
        expect(await f.store.recoverLegacyHandoffReceipt(f.scope, task.id, task.revision)).toBe(false)
        await f.store.finishClaim(worker.id, claim, 'succeeded')
        expect((await f.store.inspectHandoff(f.scope, task.id)).evidence).toBe('legacy_returned')
        await expect(
            f.store.recoverLegacyHandoffReceipt({ ...f.scope, organizationId: randomUUID() }, task.id, task.revision)
        ).rejects.toMatchObject({ reason: 'scope' })
        await expect(f.store.recoverLegacyHandoffReceipt(f.scope, task.id, task.revision + 1)).rejects.toMatchObject({
            reason: 'claimed'
        })
        expect(await f.store.recoverLegacyHandoffReceipt(f.scope, task.id, task.revision)).toBe(true)
        expect((await f.store.publication(task.id)).result).toEqual({ status: 'ok' })
        expect((await f.store.publication(task.id)).diagnostic.code).toBe('receipt_recovered')
        expect(await f.store.settled(x.parent.id, false)).toBe(true)
        expect(await f.store.recoverLegacyHandoffReceipt(f.scope, task.id, task.revision + 1)).toBe(false)
        expect(x.body).not.toHaveBeenCalled()
        expect(await f.queue.getWaitingCount()).toBe(0)
    })

    it.each(['failed', 'succeeded'] as const)(
        'does not recover a legacy callback without its own result, even with a %s worker',
        async (outcome) => {
            const x = await setup()
            const task = await f.store.publish(
                {
                    ...f.scope,
                    kind: 'handoff',
                    resourceId: x.message.id,
                    parent: { version: 2, targetId: x.parent.id }
                },
                { message: x.message, delayMs: 0, drainOnPause: false }
            )
            const worker = await f.store.register({
                ...f.scope,
                kind: 'managed-queue',
                resourceId: randomUUID(),
                parent: { version: 2, targetId: task.id }
            })
            await f.store.finishClaim(worker.id, await f.store.claim(worker.id), outcome)
            expect(await f.store.recoverLegacyHandoffReceipt(f.scope, task.id, task.revision)).toBe(false)
            await f.store.change(x.parent.id, 'terminated')
            expect(await f.store.settleUnstarted(task.id)).toBe(false)
            expect(await f.store.settled(x.parent.id, false)).toBe(false)
        }
    )
})
