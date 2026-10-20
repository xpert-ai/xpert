// Disposable Redis/PostgreSQL only. Real platform queue delivery with a two-connection database pool.
jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { randomUUID } from 'node:crypto'
import { DataSource, EntitySchema } from 'typeorm'
import { Queue, Worker } from 'bullmq'
import { createClient } from 'redis'
import { Test, TestingModule } from '@nestjs/testing'
import { DiscoveryService, Reflector } from '@nestjs/core'
import {
    MANAGED_QUEUE_SERVICE_TOKEN,
    ProjectTaskProviderRegistry,
    RequestContext,
    resolveTenantGlobalScopeKey,
    type ProjectTaskContext,
    type ProjectTaskProjection
} from '@xpert-ai/plugin-sdk'
import {
    ManagedQueueService,
    ManagedQueueProcessor,
    ManagedQueueHandlerRegistryService,
    RedisLockService,
    REDIS_CLIENT,
    UserService,
    type ManagedQueueEnvelope
} from '@xpert-ai/server-core'
import { getRepositoryToken } from '@nestjs/typeorm'
import { ProjectAccessRuntimeService } from '../project-access-runtime.service'
import { ProjectTaskGraphService } from '../project-task-graph.service'
import { XpertProject, XpertProjectTask, XpertProjectTaskExecution } from '../../../core/entities/internal'
import { ProjectTaskProjectionStore } from './project-task-projection.store'
import { ProjectTaskProjectionCoordinator } from './project-task-projection.coordinator'
import { ProjectTaskProjectionService, PROJECT_TASK_PROJECTION_JOB } from './project-task-projection.service'
import { runWithCapturedRequestContext } from '../../../shared/request-context'

const integration =
    process.env.XPERT_PROJECTION_TEST_DATABASE_URL && process.env.XPERT_PROJECTION_TEST_REDIS_URL
        ? describe
        : describe.skip
const uuid = { type: 'uuid' as const }
const text = { type: 'varchar' as const }
const nullableText = { ...text, nullable: true }
const json = { type: 'jsonb' as const, nullable: true }
const base = { id: { ...uuid, primary: true }, tenantId: uuid, organizationId: { ...uuid, nullable: true } }
const projectBase = { ...base, projectId: uuid, createdById: uuid }
const schemas = [
    new EntitySchema<XpertProject>({
        name: 'XpertProject',
        target: XpertProject,
        tableName: 'xpert_project',
        columns: { ...base, name: text }
    }),
    new EntitySchema<XpertProjectTask>({
        name: 'XpertProjectTask',
        target: XpertProjectTask,
        tableName: 'xpert_project_task',
        columns: {
            ...projectBase,
            name: text,
            title: text,
            status: text,
            kind: text,
            type: nullableText,
            progress: { type: 'double precision', nullable: true },
            providerKey: nullableText,
            sourceKey: nullableText,
            sourceRevision: nullableText,
            controlKind: { type: 'varchar', default: 'ordinary' },
            pipelineInstanceId: { ...uuid, nullable: true },
            pipelineDisposition: nullableText,
            parentTaskId: { ...uuid, nullable: true },
            predecessorIds: json,
            diagnostic: nullableText,
            assigneeXpertId: { ...uuid, nullable: true },
            revision: { type: 'int', version: true },
            createdAt: { type: 'timestamptz', createDate: true }
        }
    }),
    new EntitySchema<XpertProjectTaskExecution>({
        name: 'XpertProjectTaskExecution',
        target: XpertProjectTaskExecution,
        tableName: 'xpert_project_task_execution',
        columns: {
            ...projectBase,
            taskId: uuid,
            sourceKey: text,
            attempt: { type: 'int' },
            status: text,
            agentExecutionId: { ...uuid, nullable: true },
            conversationId: { ...uuid, nullable: true },
            threadId: nullableText,
            xpertId: { ...uuid, nullable: true },
            agentKey: nullableText,
            error: nullableText,
            outputSummary: nullableText,
            invocationId: { ...uuid, nullable: true },
            startedAt: { type: 'timestamptz', nullable: true },
            completedAt: { type: 'timestamptz', nullable: true }
        }
    })
]

function deferred() {
    let resolve: () => void
    const promise = new Promise<void>((done) => {
        resolve = done
    })
    return { promise, resolve: () => resolve() }
}
async function until(check: () => Promise<boolean>, timeout = 10_000) {
    const deadline = Date.now() + timeout
    while (!(await check())) {
        if (Date.now() > deadline) throw new Error('Test condition timed out')
        await new Promise((resolve) => setTimeout(resolve, 20))
    }
}
const task = (key: string, status: ProjectTaskProjection['status'] = 'in_progress'): ProjectTaskProjection => ({
    key,
    title: key,
    kind: 'task',
    status,
    predecessorKeys: [],
    executions: []
})

integration('managed project task projection concurrency', () => {
    let db: DataSource
    let redis: ReturnType<typeof createClient>
    let context: ProjectTaskContext
    let store: ProjectTaskProjectionStore
    let coordinator: ProjectTaskProjectionCoordinator
    let domain: ProjectTaskProjection[]
    let provider: { key: string; snapshot: jest.Mock; linked: jest.Mock }
    let access: { listReadable: jest.Mock }
    let registry: ProjectTaskProviderRegistry
    let service: ProjectTaskProjectionService
    let graph: ProjectTaskGraphService
    let module: TestingModule
    let queue: Queue<ManagedQueueEnvelope>
    let managed: ManagedQueueService
    let workers: Worker<ManagedQueueEnvelope>[]
    let schema: string
    const connection = () => {
        const url = new URL(process.env.XPERT_PROJECTION_TEST_REDIS_URL!)
        // Queue and lock clients must observe the same logical Redis database.
        return {
            host: url.hostname,
            port: Number(url.port),
            db: Number(url.pathname.slice(1) || 0),
            maxRetriesPerRequest: null
        }
    }

    beforeAll(async () => {
        schema = `projection_${randomUUID().replace(/-/g, '')}`
        db = new DataSource({
            type: 'postgres',
            url: process.env.XPERT_PROJECTION_TEST_DATABASE_URL,
            schema,
            entities: schemas,
            poolSize: 2,
            extra: { connectionTimeoutMillis: 2_000 }
        })
        await db.initialize()
        await db.query(`CREATE SCHEMA "${schema}"`)
        await db.synchronize()
        redis = createClient({ url: process.env.XPERT_PROJECTION_TEST_REDIS_URL })
        await redis.connect()
    }, 30_000)

    afterAll(async () => {
        if (db?.isInitialized) {
            await db.query(`DROP SCHEMA "${schema}" CASCADE`)
            await db.destroy()
        }
        if (redis?.isOpen) await redis.quit()
    })

    beforeEach(async () => {
        await redis.flushDb()
        await db.getRepository(XpertProjectTaskExecution).clear()
        await db.getRepository(XpertProjectTask).clear()
        context = {
            projectId: randomUUID(),
            actor: { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID() }
        }
        await db.getRepository(XpertProject).save({
            id: context.projectId,
            name: 'Bid project',
            tenantId: context.actor.tenantId,
            organizationId: context.actor.organizationId
        })
        queue = new Queue(`projection-${randomUUID()}`, { connection: connection() })
        managed = new ManagedQueueService(queue)
        const enqueue = managed.enqueue.bind(managed)
        // Keep real queue delivery/backoff, shortening only test timing.
        jest.spyOn(managed, 'enqueue').mockImplementation((input) => enqueue({ ...input, delayMs: 1, backoffMs: 50 }))
        workers = []
        domain = [task('chapter')]
        provider = {
            key: 'bid.tasks',
            snapshot: jest.fn(async () => {
                expect(RequestContext.getScope()).toMatchObject({
                    tenantId: context.actor.tenantId,
                    organizationId: context.actor.organizationId
                })
                expect(RequestContext.currentUser()?.id).toBe(context.actor.userId)
                await Promise.all(
                    Array.from({ length: 4 }, () =>
                        db.getRepository(XpertProject).findOneByOrFail({ id: context.projectId })
                    )
                )
                return { revision: 'content-hash', tasks: structuredClone(domain) }
            }),
            linked: jest.fn(async () => {
                await db.query('SELECT 1')
            })
        }
        access = {
            listReadable: jest.fn(
                async ({ actor, projectIds }: { actor: ProjectTaskContext['actor']; projectIds: string[] }) =>
                    actor.tenantId === context.actor.tenantId &&
                    actor.organizationId === context.actor.organizationId &&
                    projectIds[0] === context.projectId
                        ? [{ role: 'editor', archived: false }]
                        : []
            )
        }
        registry = new ProjectTaskProviderRegistry({} as DiscoveryService, new Reflector())
        registry.register(provider.key, provider, {
            kind: 'plugin',
            pluginName: 'bid',
            scopeKey: resolveTenantGlobalScopeKey(context.actor.tenantId)
        })
        module = await Test.createTestingModule({
            providers: [
                ProjectTaskProjectionService,
                ProjectTaskProjectionStore,
                ProjectTaskProjectionCoordinator,
                RedisLockService,
                { provide: REDIS_CLIENT, useValue: redis },
                { provide: MANAGED_QUEUE_SERVICE_TOKEN, useValue: managed },
                { provide: getRepositoryToken(XpertProject), useValue: db.getRepository(XpertProject) },
                { provide: ProjectAccessRuntimeService, useValue: access },
                { provide: ProjectTaskProviderRegistry, useValue: registry }
            ]
        }).compile()
        service = module.get(ProjectTaskProjectionService)
        store = module.get(ProjectTaskProjectionStore)
        coordinator = module.get(ProjectTaskProjectionCoordinator)
        graph = new ProjectTaskGraphService(
            db.getRepository(XpertProjectTask),
            module.get(ProjectAccessRuntimeService),
            registry,
            service,
            { listForActor: () => [] } as never
        )
    })

    afterEach(async () => {
        await Promise.all(workers.map((worker) => worker.close(true)))
        await queue.obliterate({ force: true })
        await queue.close()
        await module.close()
    })

    function startWorker() {
        // Each registry models an API replica's independent local concurrency limiter.
        const handlers = new ManagedQueueHandlerRegistryService()
        const replica = new ProjectTaskProjectionService(
            store,
            module.get(ProjectAccessRuntimeService),
            registry,
            coordinator,
            managed
        )
        handlers.register({
            ...PROJECT_TASK_PROJECTION_JOB,
            concurrency: 1,
            handler: (job, scope) => replica.handle(job, scope)
        })
        const users = { findOneByIdWithinTenant: jest.fn(async (id: string, tenantId: string) => ({ id, tenantId })) }
        const processor = new ManagedQueueProcessor(handlers, users as unknown as UserService)
        const worker = new Worker<ManagedQueueEnvelope>(queue.name, (job) => processor.process(job), {
            connection: connection(),
            concurrency: 10,
            lockDuration: 500,
            lockRenewTime: 100,
            stalledInterval: 100
        })
        workers.push(worker)
        return worker
    }

    function refresh() {
        return runWithCapturedRequestContext(
            {
                user: { id: context.actor.userId, tenantId: context.actor.tenantId },
                headers: {
                    'tenant-id': context.actor.tenantId,
                    'organization-id': context.actor.organizationId!,
                    'x-scope-level': 'organization'
                }
            },
            () => graph.refresh(context)
        )
    }

    async function drain() {
        await until(async () => {
            const counts = await queue.getJobCounts('active', 'waiting', 'delayed', 'failed')
            return Object.values(counts).every((value) => value === 0)
        })
    }

    it('coalesces 13 commercial and 7 chapter requests across three API workers with only two DB connections', async () => {
        domain = [
            ...Array.from({ length: 13 }, (_, i) => task(`commercial-${i}`)),
            ...Array.from({ length: 7 }, (_, i) => task(`chapter-${i}`))
        ]
        await Promise.all(domain.map(() => refresh()))
        expect(provider.snapshot).not.toHaveBeenCalled()
        expect((await graph.graph(context)).tasks).toEqual([])
        startWorker()
        startWorker()
        startWorker()
        await drain()
        expect(provider.snapshot).toHaveBeenCalledTimes(1)
        expect(provider.linked).toHaveBeenCalledTimes(1)
        expect((await graph.graph(context)).tasks).toHaveLength(20)
        await Promise.all(Array.from({ length: 20 }, () => graph.graph(context)))
        expect(provider.snapshot).toHaveBeenCalledTimes(1)
        expect(await db.query('SELECT 1 AS ready')).toEqual([{ ready: 1 }])
    }, 15_000)

    it('preserves refreshes arriving during a snapshot and keeps reads available while another replica waits', async () => {
        const entered = deferred(),
            release = deferred()
        provider.snapshot.mockImplementationOnce(async () => {
            entered.resolve()
            await release.promise
            return { revision: 'old', tasks: [task('obsolete')] }
        })
        await refresh()
        startWorker()
        await entered.promise
        try {
            domain = [task('new-chapter')]
            await refresh()
            startWorker()
            expect((await graph.graph(context)).tasks).toEqual([])
            expect(provider.snapshot).toHaveBeenCalledTimes(1)
        } finally {
            release.resolve()
        }
        await drain()
        expect((await graph.graph(context)).tasks.map((row) => row.title)).toEqual(['new-chapter'])
    })

    it('does not lose a refresh at the finish/release boundary', async () => {
        const finish = coordinator.finish.bind(coordinator)
        jest.spyOn(coordinator, 'finish').mockImplementationOnce(async (claim, diagnostics) => {
            await finish(claim, diagnostics)
            domain = [task('chapter', 'done')]
            await refresh()
        })
        await refresh()
        startWorker()
        await drain()
        expect(provider.snapshot).toHaveBeenCalledTimes(2)
        expect((await graph.graph(context)).tasks[0].status).toBe('done')
    })

    it('recovers a stalled delivery after worker loss and fences its late result after a successor commits', async () => {
        const entered = deferred(),
            release = deferred()
        provider.snapshot.mockImplementationOnce(async () => {
            entered.resolve()
            await release.promise
            return { revision: 'obsolete', tasks: [] }
        })
        await refresh()
        const old = startWorker()
        await entered.promise
        await old.close(true)
        // Simulate the project's lease expiry after process loss without waiting 120 seconds.
        const keys = await redis.keys('*:project-tasks:*:lock')
        await redis.del(keys)
        domain = [task('chapter', 'done'), task('new-chapter')]
        startWorker()
        try {
            await drain()
            expect(provider.snapshot).toHaveBeenCalledTimes(2)
        } finally {
            release.resolve()
        }
        await new Promise((resolve) => setTimeout(resolve, 100))
        expect((await graph.graph(context)).tasks.map(({ title, status }) => ({ title, status }))).toEqual([
            { title: 'chapter', status: 'done' },
            { title: 'new-chapter', status: 'in_progress' }
        ])
    })

    it('rejects an expired lease even without a successor, and isolates tenant/organization fences', async () => {
        const revision = await coordinator.invalidate(context)
        const claim = (await coordinator.claim(context, revision))!
        await redis.del(await redis.keys('*:project-tasks:*:lock'))
        await expect(store.apply(claim, provider, { revision: 'late', tasks: domain })).rejects.toThrow()
        await expect(coordinator.finish(claim, [])).rejects.toThrow()
        const current = (await coordinator.claim(context, revision))!
        await expect(
            store.apply(
                { ...current, context: { ...context, actor: { ...context.actor, organizationId: randomUUID() } } },
                provider,
                { revision: 'foreign', tasks: domain }
            )
        ).rejects.toThrow()
        expect(await db.getRepository(XpertProjectTask).count()).toBe(0)
        await coordinator.release(current)
    })

    it('rolls back partial writes, exposes the actual failure, and retries through the platform queue', async () => {
        await refresh()
        startWorker()
        await drain()
        domain[0].status = 'done'
        domain[0].executions = [{ key: 'attempt', attempt: 2147483648, status: 'running' }]
        await refresh()
        await until(async () => (await graph.graph(context)).diagnostics.length > 0)
        expect((await graph.graph(context)).tasks[0].status).toBe('in_progress')
        expect(await db.getRepository(XpertProjectTaskExecution).count()).toBe(0)
        domain[0].executions[0].attempt = 1
        await drain()
        expect((await graph.graph(context)).tasks[0].status).toBe('done')
        expect((await graph.graph(context)).diagnostics).toEqual([])
    })

    it('bounds a project row-lock wait while reads stay available, then retries', async () => {
        const blocker = db.createQueryRunner()
        await blocker.startTransaction()
        try {
            await blocker.manager.findOneOrFail(XpertProject, {
                where: { id: context.projectId },
                lock: { mode: 'pessimistic_write' }
            })
            await refresh()
            startWorker()
            await until(async () =>
                (await graph.graph(context)).diagnostics.some((item) => item.message.includes('lock timeout'))
            )
            expect(await db.getRepository(XpertProjectTask).count()).toBe(0)
        } finally {
            await blocker.rollbackTransaction()
            await blocker.release()
        }
        await drain()
        expect((await graph.graph(context)).tasks).toHaveLength(1)
    }, 15_000)

    it('rejects unauthorized requests and rechecks revoked access after enqueue', async () => {
        await expect(
            service.request({ ...context, actor: { ...context.actor, tenantId: randomUUID() } })
        ).rejects.toThrow()
        expect(managed.enqueue).not.toHaveBeenCalled()
        await refresh()
        access.listReadable.mockResolvedValue([])
        const worker = startWorker()
        await until(async () => (await queue.getJobs(['delayed'])).some((job) => job.attemptsMade > 0))
        expect(provider.snapshot).not.toHaveBeenCalled()
        await worker.close(true)
    })

    it('still returns the saved graph when Redis status reads fail', async () => {
        await refresh()
        startWorker()
        await drain()
        jest.spyOn(managed, 'getRedis').mockRejectedValueOnce(new Error('redis unavailable'))
        expect(await graph.graph(context)).toMatchObject({
            tasks: [expect.objectContaining({ title: 'chapter' })],
            diagnostics: [expect.objectContaining({ providerKey: 'platform.project.tasks' })]
        })
    })
})
