import { randomUUID } from 'node:crypto'
import { DataSource } from 'typeorm'
import { Queue, Worker } from 'bullmq'
import { createClient } from 'redis'
import { HandoffMessage, ProcessContext, ProcessResult } from '@xpert-ai/plugin-sdk'
import {
    TaskControlStore,
    TaskControlRunner,
    withTaskControl,
    ManagedQueueHandlerRegistryService,
    ManagedQueueService,
    ControlRuntimeAdmissionService
} from '@xpert-ai/server-core'
import { InstanceRegistryService } from '../../../../server/src/managed-connection/instance-registry.service'
import { AdmittedManagedQueueProcessor } from '../../../../server/src/managed-queue/admitted-queue.processor'
import type { ManagedQueueEnvelope } from '../../../../server/src/managed-queue/constants'
import {
    taskControlTestEntities,
    seedTaskControlScope
} from '../../../../server/src/task-control/testing/task-control.fixture'
import { HandoffQueueService } from '../message-queue.service'
import { MessageDispatcherService } from '../message-dispatcher.service'
import { HandoffCancelService } from '../handoff-cancel.service'
import { HandoffPendingResultService } from '../pending-result.service'

export async function controlledHandoffFixture(url: string, redisUrl: string) {
    if (!new URL(url).pathname.endsWith('_test') || new URL(redisUrl).hostname !== '127.0.0.1')
        throw new Error('Disposable local infrastructure required')
    const schema = `handoff_${randomUUID().replace(/-/g, '')}`
    const database = await new DataSource({
        type: 'postgres',
        uuidExtension: 'pgcrypto',
        url,
        schema,
        extra: { options: `-c search_path=${schema}` },
        entities: taskControlTestEntities
    }).initialize()
    await database.query(`CREATE SCHEMA "${schema}"`)
    await database.synchronize()
    const scope = { tenantId: randomUUID(), organizationId: randomUUID() }
    await seedTaskControlScope(database, scope)
    const store = new TaskControlStore(database)
    const redis = createClient({ url: redisUrl })
    await redis.connect()
    const instances = new InstanceRegistryService(redis)
    await instances.onModuleInit()
    const registry = new ManagedQueueHandlerRegistryService()
    const admission = new ControlRuntimeAdmissionService(database, instances)
    admission.registerManagedQueue(['default'], () => registry.controlHandlers())
    const redisAddress = new URL(redisUrl)
    const connection = { host: redisAddress.hostname, port: Number(redisAddress.port) }
    const queues = ['plain', 'browser', 'v2', 'v2-browser', 'v3', 'v3-browser'].map(
        (suffix) => new Queue<ManagedQueueEnvelope>(`${schema}-${suffix}`, { connection })
    )
    const [plain, browser, legacy, legacyBrowser, queue, admittedBrowser] = queues
    const managed = new ManagedQueueService(
        plain,
        browser,
        legacy,
        legacyBrowser,
        store,
        queue,
        admittedBrowser,
        admission
    )
    const workers: Worker[] = []
    const runners: TaskControlRunner[] = []
    const services: HandoffQueueService[] = []
    const ready = async () => {
        await admission.refresh()
        await instances.setReady(true, Date.now() + 5000)
    }
    const route = { resolve: () => ({ queue: 'legacy', lane: 'main', policy: { lane: 'main' } }) }
    function service(
        body: (message: HandoffMessage, context: ProcessContext) => Promise<ProcessResult>,
        register = true
    ) {
        const pending = new HandoffPendingResultService()
        const dispatcher = new MessageDispatcherService(
            { get: () => ({ process: body, policy: { lane: 'main' } }) } as never,
            pending,
            new HandoffCancelService(undefined, store)
        )
        const instance = new HandoffQueueService(
            undefined,
            route as never,
            pending,
            store,
            managed,
            registry,
            dispatcher
        )
        if (register) instance.onModuleInit()
        services.push(instance)
        return instance
    }
    return {
        database,
        scope,
        store,
        registry,
        admission,
        managed,
        queue,
        legacy,
        ready,
        service,
        async parent(parentId?: string) {
            const task = await store.register({
                ...scope,
                kind: 'execution',
                resourceId: randomUUID(),
                executionId: randomUUID(),
                ...(parentId ? { parent: { version: 2 as const, targetId: parentId } } : {})
            })
            await store.receipt(task.id, 'running')
            return task
        },
        message(): HandoffMessage {
            return {
                id: randomUUID(),
                type: 'test.callback',
                version: 1,
                ...scope,
                headers: { organizationId: scope.organizationId },
                sessionKey: 'session',
                businessKey: 'business',
                attempt: 1,
                maxAttempts: 2,
                traceId: 'trace',
                enqueuedAt: Date.now(),
                payload: {}
            }
        },
        owned<T>(id: string, work: () => T) {
            return withTaskControl({ version: 2, targetId: id }, work)
        },
        async worker() {
            const runner = new TaskControlRunner(store)
            runners.push(runner)
            // Actorless callback fixture: production identity restoration is still used by the processor.
            const processor = new AdmittedManagedQueueProcessor(registry, undefined, store, runner, admission)
            const worker = new Worker(queue.name, (job) => processor.process(job), { connection })
            worker.on('error', () => undefined)
            workers.push(worker)
            await worker.waitUntilReady()
            return { worker, runner, processor }
        },
        async close() {
            for (const worker of workers) await worker.close(true)
            for (const runner of runners) runner.onModuleDestroy()
            for (const item of services) item.onModuleDestroy()
            await instances.onModuleDestroy()
            await redis.quit()
            for (const item of queues) {
                await item.obliterate({ force: true })
                await item.close()
            }
            await database.query(`DROP SCHEMA "${schema}" CASCADE`)
            await database.destroy()
        }
    }
}

export async function until(work: () => Promise<boolean>) {
    const deadline = Date.now() + 10000
    while (Date.now() < deadline) {
        if (await work()) return
        await new Promise((done) => setTimeout(done, 25))
    }
    throw new Error('Expected controlled Handoff state not reached')
}
