import {
    taskControlTestEntities,
    seedTaskControlScope
} from '../../../server/src/task-control/testing/task-control.fixture'
import { runWithHandoffMessageContext } from './message-context'
import { randomUUID } from 'node:crypto'
import { DataSource } from 'typeorm'
import { Queue, Worker } from 'bullmq'
import {
    TaskControlPublication,
    TaskControlStore,
    TaskControlRunner,
    withTaskControl,
    ManagedQueueHandlerRegistryService,
    ManagedQueueService
} from '@xpert-ai/server-core'
import { ControlledManagedQueueProcessor } from '../../../server/src/managed-queue/managed-queue.processor'
import { HandoffMessage, ProcessContext } from '@xpert-ai/plugin-sdk'
import { HandoffQueueService } from './message-queue.service'
import { MessageDispatcherService } from './message-dispatcher.service'
import { HandoffCancelService } from './handoff-cancel.service'
import { HandoffPendingResultService } from './pending-result.service'

const url = process.env.XPERT_PAUSE_TEST_DATABASE_URL,
    redisUrl = process.env.XPERT_CONTROL_TEST_REDIS_URL
const integration = url && redisUrl ? describe : describe.skip
integration('controlled Handoff / Managed Queue persistence', () => {
    const schema = `handoff_control_${randomUUID().replace(/-/g, '')}`,
        scope = { tenantId: randomUUID(), organizationId: randomUUID() }
    let database: DataSource, store: TaskControlStore, runner: TaskControlRunner
    const resources: Array<{ worker: Worker; queue: Queue; service: HandoffQueueService }> = []
    beforeAll(async () => {
        if (!new URL(url).pathname.endsWith('_test') || new URL(redisUrl).hostname !== '127.0.0.1')
            throw new Error('Disposable local infrastructure required')
        database = await new DataSource({
            type: 'postgres',
            uuidExtension: 'pgcrypto',
            url,
            schema,
            extra: { options: `-c search_path=${schema}` },
            entities: taskControlTestEntities
        }).initialize()
        await database.query(`CREATE SCHEMA "${schema}"`)
        await database.synchronize()
        await seedTaskControlScope(database, scope)
        store = new TaskControlStore(database)
        runner = new TaskControlRunner(store)
    })
    afterAll(async () => {
        for (const item of resources) {
            await item.worker.close(true)
            item.service.onModuleDestroy()
            await item.queue.obliterate({ force: true })
            await item.queue.close()
        }
        runner?.onModuleDestroy()
        if (database?.isInitialized) {
            await database.query(`DROP SCHEMA "${schema}" CASCADE`)
            await database.destroy()
        }
    })
    async function fixture(body: (message: HandoffMessage, context: ProcessContext) => Promise<{ status: 'ok' }>) {
        const redis = new URL(redisUrl),
            connection = { host: redis.hostname, port: Number(redis.port) },
            name = `handoff-v2-${randomUUID()}`
        const queue = new Queue(name, { connection })
        const registry = new ManagedQueueHandlerRegistryService()
        const managed = new ManagedQueueService(queue, queue, queue, queue, store)
        const dispatcher = new MessageDispatcherService(
            { get: () => ({ process: body, policy: { lane: 'main' } }) } as never,
            new HandoffPendingResultService(),
            new HandoffCancelService(undefined, store)
        )
        const route = { resolve: () => ({ queue: 'legacy', lane: 'main', policy: { lane: 'main' } }) }
        const workerPending = new HandoffPendingResultService(),
            callerPending = new HandoffPendingResultService()
        const service = new HandoffQueueService(
            undefined,
            route as never,
            workerPending,
            store,
            managed,
            registry,
            dispatcher
        )
        service.onModuleInit()
        const caller = new HandoffQueueService(
            undefined,
            route as never,
            callerPending,
            store,
            managed,
            registry,
            dispatcher
        )
        const processor = new ControlledManagedQueueProcessor(registry, undefined, store, runner)
        const worker = new Worker(name, (job) => processor.process(job), { connection, autorun: false })
        worker.on('error', () => undefined)
        resources.push({ worker, queue, service })
        const parent = await store.register({
            ...scope,
            kind: 'execution',
            resourceId: randomUUID(),
            executionId: randomUUID()
        })
        await store.receipt(parent.id, 'running')
        const message: HandoffMessage = {
            id: randomUUID(),
            type: 'test',
            version: 1,
            tenantId: scope.tenantId,
            headers: { organizationId: scope.organizationId },
            sessionKey: 'session',
            businessKey: 'business',
            attempt: 1,
            maxAttempts: 2,
            traceId: 'trace',
            enqueuedAt: Date.now(),
            payload: {}
        }
        const owned = <T>(work: () => T) => withTaskControl({ version: 2, targetId: parent.id }, work)
        return { parent, owned, caller, callerPending, workerPending, managed, service, worker, queue, message }
    }
    async function until(work: () => Promise<boolean>) {
        const deadline = Date.now() + 10000
        while (Date.now() < deadline) {
            if (await work()) return
            await new Promise((done) => setTimeout(done, 25))
        }
        throw new Error('Condition not reached')
    }

    it('lets an admitted synchronous child drain during pause and returns its durable result to another waiter registry', async () => {
        const body = jest.fn(async () => ({ status: 'ok' as const }))
        const f = await fixture(body)
        const waiting = f.owned(() => f.caller.enqueueAndWait(f.message, { timeoutMs: 10000 }))
        await until(async () => (await f.queue.getWaitingCount()) === 1)
        await store.change(f.parent.id, 'paused')
        expect(await store.settled(f.parent.id, true)).toBe(false)
        void f.worker.run()
        await expect(waiting).resolves.toEqual({ status: 'ok' })
        await until(() => store.settled(f.parent.id, true))
        expect(body).toHaveBeenCalledTimes(1)
        expect(f.callerPending.size()).toBe(0)
        expect(f.workerPending.size()).toBe(0)
        await store.change(f.parent.id, 'running')
        await f.service.reconcileControlledPublications()
        await f.managed.reconcilePublications()
        expect(body).toHaveBeenCalledTimes(1)
    }, 15000)

    it('retains an async queued child while paused, then stops it before the handler even if Redis removal loses the race', async () => {
        const body = jest.fn(async () => ({ status: 'ok' as const }))
        const f = await fixture(body)
        await f.owned(() => f.caller.enqueue(f.message))
        await store.change(f.parent.id, 'paused')
        void f.worker.run()
        const job = await f.queue.getJob(`handoff-v2-${f.message.id}`)
        await until(async () => (await job.getState()) === 'delayed')
        expect(body).not.toHaveBeenCalled()
        expect(job.attemptsMade).toBe(0)
        await store.change(f.parent.id, 'terminated')
        await job.promote()
        await until(async () => (await job.getState()) === 'completed')
        expect(body).not.toHaveBeenCalled()
    }, 15000)

    it('reconciles failed Redis publication using the same job and preserves a successful business result after cancellation', async () => {
        let entered!: () => void, release!: () => void
        const started = new Promise<void>((done) => {
                entered = done
            }),
            gate = new Promise<void>((done) => {
                release = done
            })
        const body = jest.fn(async (_message: HandoffMessage, context: ProcessContext) => {
            entered()
            await gate
            expect(context.abortSignal.aborted).toBe(true)
            return { status: 'ok' as const }
        })
        const f = await fixture(body)
        const add = jest.spyOn(f.queue, 'add').mockRejectedValueOnce(new Error('Redis unavailable'))
        await f.owned(() => f.caller.enqueue(f.message))
        expect(await f.queue.getWaitingCount()).toBe(0)
        await database
            .getRepository(TaskControlPublication)
            .createQueryBuilder()
            .update()
            .set({ nextAttemptAt: new Date(0) })
            .execute()
        await f.managed.reconcilePublications()
        await f.managed.reconcilePublications()
        void f.worker.run()
        await started
        await store.change(f.parent.id, 'terminated')
        await runner.reconcile()
        expect(await store.settled(f.parent.id, false)).toBe(false)
        release()
        const target = await store.find(scope, 'handoff', f.message.id)
        await until(async () => (await store.read(target.id)).state === 'completed')
        expect((await store.publication(target.id)).result).toEqual({ status: 'ok' })
        expect(body).toHaveBeenCalledTimes(1)
        expect(add).toHaveBeenCalledTimes(2)
    }, 15000)
    it('cancels a persisted queue publication before Redis has any job handle', async () => {
        const f = await fixture(jest.fn(async () => ({ status: 'ok' as const })))
        jest.spyOn(f.queue, 'add').mockRejectedValueOnce(new Error('Redis unavailable'))
        const input = {
            pluginName: 'test',
            queueName: 'test',
            jobName: 'test',
            jobId: randomUUID(),
            payload: {},
            ...scope,
            controlPolicy: 'attached' as const
        }
        await f.owned(() => f.managed.enqueue(input))
        expect(await f.queue.getJob(input.jobId)).toBeUndefined()
        await expect(
            runWithHandoffMessageContext(f.message, () => f.managed.cancel({ jobId: input.jobId }))
        ).resolves.toMatchObject({ success: true, state: 'cancelled' })
        const task = await store.find(scope, 'managed-queue', `default/${input.jobId}`)
        expect(await store.desired(task.id)).toBe('terminated')
        expect(task.state).toBe('completed')
    })

    it('rejects an old envelope on the controlled queue without entering a business handler', async () => {
        const body = jest.fn(async () => ({ status: 'ok' as const })),
            f = await fixture(body)
        const job = await f.queue.add('dispatch', {
            pluginName: '@xpert-ai/handoff',
            queueName: 'handoff-control-v2',
            jobName: 'dispatch',
            payload: f.message
        })
        void f.worker.run()
        await until(async () => (await job.getState()) === 'failed')
        expect(body).not.toHaveBeenCalled()
    })
})
