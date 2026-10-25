// Real PostgreSQL locks and receipts: protocol replies never substitute for actual work settlement.
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { DataSource, Entity, PrimaryColumn } from 'typeorm'
import { getConfig, setConfig } from '@xpert-ai/server-config'
import { sandboxEvidence, SandboxRuntimeTarget } from '@xpert-ai/contracts'
import {
    ExecutionTaskControl,
    TaskControlPublication,
    TaskControlStore,
    TaskControlRunner,
    withTaskControl
} from '@xpert-ai/server-core'
import { SandboxRuntimeProviderRegistry, SandboxJobRunInput, TaskControlPolicy } from '@xpert-ai/plugin-sdk'
import { SandboxJobEntity } from './sandbox-job.entity'
import { SandboxJobControlStore } from './sandbox-job-control.store'
import { SandboxJobControlService } from './sandbox-job-control.service'
import { SandboxJobCapacityService } from './sandbox-job-capacity.service'
import { readControlledSandboxJob } from './sandbox-job-control-record'

@Entity('user')
class User {
    @PrimaryColumn('uuid') id: string
}
@Entity('tenant')
class Tenant {
    @PrimaryColumn('uuid') id: string
}
@Entity('organization')
class Organization {
    @PrimaryColumn('uuid') id: string
}

const url = process.env.XPERT_PAUSE_TEST_DATABASE_URL
const integration = url ? describe : describe.skip
integration('Sandbox 3.3.1 durable control / PostgreSQL', () => {
    const schema = `sandbox_${randomUUID().replace(/-/g, '')}`
    const scope = {
        tenantId: randomUUID(),
        organizationId: randomUUID(),
        userId: randomUUID(),
        pluginName: 'test',
        businessResourceType: 'test',
        businessResourceId: 'one'
    }
    let db: DataSource,
        tasks: TaskControlStore,
        runner: TaskControlRunner,
        store: SandboxJobControlStore,
        other: SandboxJobControlStore
    let control: SandboxJobControlService, remote: SandboxJobControlService, capacity: SandboxJobCapacityService
    const previous = getConfig().sandboxJobOptions
    const exits = new Set<string>()
    const provider = {
        type: 'test',
        version: '1',
        capabilities: { executionControl: 1 as const },
        prepareControl: jest.fn(async (options) => ({
            version: 1 as const,
            kind: 'host' as const,
            provider: 'test',
            runtimeProfile: 'test',
            generation: options.generation,
            environmentId: store.hostId,
            runtimeRef: options.generation
        })),
        control: jest.fn(async (target: SandboxRuntimeTarget, _action: string) =>
            sandboxEvidence(target, exits.has(target.generation) ? 'exited' : 'running')
        ),
        destroy: jest.fn(async () => undefined)
    }
    const volume = { resolve: () => ({ destroyRuntimeJob: jest.fn(async () => undefined) }) }
    beforeAll(async () => {
        if (!new URL(url).pathname.endsWith('_test')) throw new Error('Disposable _test database required')
        db = await new DataSource({
            type: 'postgres',
            uuidExtension: 'pgcrypto',
            url,
            schema,
            extra: { options: `-c search_path=${schema}` },
            entities: [SandboxJobEntity, ExecutionTaskControl, TaskControlPublication, User, Tenant, Organization]
        }).initialize()
        await db.query(`CREATE SCHEMA "${schema}"`)
        await db.synchronize()
        for (const [table, id] of [
            ['tenant', scope.tenantId],
            ['organization', scope.organizationId]
        ])
            await db.query(`INSERT INTO "${table}"(id) VALUES ($1)`, [id])
        tasks = new TaskControlStore(db)
        runner = new TaskControlRunner(tasks)
    })
    beforeEach(async () => {
        await db.query('TRUNCATE sandbox_job, execution_task_control, execution_task_publication')
        store = new SandboxJobControlStore(db.getRepository(SandboxJobEntity), tasks)
        other = new SandboxJobControlStore(db.getRepository(SandboxJobEntity), tasks)
        control = new SandboxJobControlService(
            store,
            { get: () => provider } as unknown as SandboxRuntimeProviderRegistry,
            runner,
            volume as never,
            tasks
        )
        remote = new SandboxJobControlService(
            other,
            {
                get: () => ({ ...provider, control: async (target) => sandboxEvidence(target, 'unknown') })
            } as unknown as SandboxRuntimeProviderRegistry,
            runner,
            volume as never,
            tasks
        )
        capacity = new SandboxJobCapacityService(db.getRepository(SandboxJobEntity))
        setConfig({ sandboxJobOptions: { globalLimit: 100, tenantLimit: 100, userLimit: 100, capacityPollMs: 250 } })
    })
    afterAll(async () => {
        setConfig({ sandboxJobOptions: previous })
        runner?.onModuleDestroy()
        if (db?.isInitialized) {
            await db.query(`DROP SCHEMA "${schema}" CASCADE`)
            await db.destroy()
        }
    })
    function input(key = randomUUID()): SandboxJobRunInput {
        return { action: 'test', actionVersion: '1', idempotencyKey: key, scope, payload: {}, outputs: [] }
    }
    async function reserve(policy: TaskControlPolicy = 'attached', data = input(), owner = store) {
        const seed = owner.jobs.create({
            ...data.scope,
            runtimeProfile: 'test',
            sandboxRuntimeVersion: '1',
            action: 'test',
            actionVersion: '1',
            idempotencyKey: data.idempotencyKey,
            status: 'waiting',
            attempt: 1,
            provider: 'test',
            runtimeBindingId: 'test',
            runtimeArtifactKind: 'filesystem',
            runtimeArtifactReference: 'test',
            cleanupPending: false,
            hardDeadlineAt: new Date(Date.now() + 60000)
        })
        return owner.reserve(seed, data, provider.version, policy)
    }
    async function start(policy: TaskControlPolicy = 'attached') {
        const { job } = await reserve(policy)
        await capacity.acquire(job)
        return control.prepare(job, { provider } as never)
    }
    const parent = () => tasks.register({ ...scope, kind: 'execution', resourceId: randomUUID() })
    const context = <T>(id: string, work: () => T) => withTaskControl({ version: 2, targetId: id }, work)

    it('claims one generation across concurrent replicas and never reopens the same invocation', async () => {
        const data = input()
        const results = await Promise.all(
            Array.from({ length: 12 }, (_, i) => reserve('attached', data, i % 2 ? store : other))
        )
        expect(results.filter((item) => item.owner)).toHaveLength(1)
        expect(new Set(results.map((item) => item.job.generation)).size).toBe(1)
        const job = results[0].job
        await tasks.change(job.control.taskId, 'terminated')
        await expect(control.prepare(job, { provider } as never)).rejects.toMatchObject({ reason: 'terminated' })
        expect((await reserve('attached', data)).owner).toBe(false)
        await expect(reserve('attached', { ...data, payload: { different: true } })).rejects.toThrow('idempotency')
    })

    it('admits an explicit business retry only after the original generation actually settled', async () => {
        const original = await start()
        const data = { ...input(), retryOf: { jobId: original.id, generation: original.generation } }
        await expect(reserve('attached', data)).rejects.toMatchObject({ code: 'SANDBOX_CONTROL_UNCONFIRMED' })
        await remote.requestStop(original)
        await expect(reserve('attached', data)).rejects.toMatchObject({ code: 'SANDBOX_CONTROL_UNCONFIRMED' })
        exits.add(original.generation)
        await control.report(original, 'cancelled')
        await control.hostExited(original)
        const retry = await reserve('attached', data)
        expect(retry.owner).toBe(true)
        expect(retry.job.generation).not.toBe(original.generation)
        await expect(
            reserve('attached', { ...input(), retryOf: { ...data.retryOf, generation: randomUUID() } })
        ).rejects.toMatchObject({ code: 'EXPORT_INPUT_INVALID' })
    })

    it('redelivers a lost cross-replica cancellation and releases only after runtime AND host exit', async () => {
        const job = await start()
        let stopCalls = 0
        control.own(job, () => {
            stopCalls++
        })
        await remote.requestStop(await other.read(job.id))
        expect(stopCalls).toBe(0)
        await control.reconcile()
        let current = await store.read(job.id)
        expect(stopCalls).toBeGreaterThan(0)
        expect(current.status).toBe('cancelling')
        expect(current.finishedAt).toBeNull()
        expect(current.capacityHeld).toBe(true)
        exits.add(job.generation)
        await control.reconcileOne(job.id)
        expect((await store.read(job.id)).capacityHeld).toBe(true)
        await control.report(job, 'cancelled')
        await control.hostExited(job)
        current = await store.read(job.id)
        expect(current.status).toBe('cancelled')
        expect(current.capacityHeld).toBe(false)
        expect(current.finishedAt).toBeInstanceOf(Date)
        console.log(
            'AFTER_CROSS_REPLICA',
            JSON.stringify({
                status: current.status,
                stopDelivered: stopCalls > 0,
                capacityHeld: current.capacityHeld,
                hostExited: current.control.hostExited,
                evidence: current.control.evidence.state
            })
        )
    })

    it('holds the real ignoring callback and its attached descendants after protocol cancellation', async () => {
        const job = await start(),
            entered = deferred<void>(),
            release = deferred<void>()
        let callbacks = 0,
            childId: string
        const work = control.callback(job, 'one', async () => {
            callbacks++
            const child = await tasks.register({
                ...scope,
                kind: 'managed-queue',
                resourceId: randomUUID(),
                parent: await tasks.producer(),
                drainOnPause: true
            })
            childId = child.id
            entered.resolve()
            await release.promise
        })
        await entered.promise
        await remote.requestStop(job)
        exits.add(job.generation)
        await control.report(job, 'cancelled')
        await control.reconcileOne(job.id)
        expect((await store.read(job.id)).capacityHeld).toBe(true)
        release.resolve()
        await work
        await control.hostExited(job)
        expect((await store.read(job.id)).capacityHeld).toBe(true)
        await tasks.settleUnstarted(childId)
        await control.reconcileOne(job.id)
        expect((await store.read(job.id)).capacityHeld).toBe(false)
        expect(callbacks).toBe(1)
        await expect(control.callback(job, 'one', async () => callbacks++)).rejects.toBeDefined()
        console.log(
            'AFTER_HOST_CALLBACK',
            JSON.stringify({ callbackCalls: callbacks, capacityHeld: false, actualCallbackAndChildSettled: true })
        )
    })

    it('allows an admitted child callback to drain a paused parent without starting work twice', async () => {
        const root = await parent()
        await tasks.claim(root.id)
        const job = await context(root.id, () => start())
        await tasks.change(root.id, 'paused')
        expect(await tasks.settled(root.id, true)).toBe(false)
        let calls = 0
        await control.callback(job, 'read', async () => ++calls)
        exits.add(job.generation)
        await control.report(job, 'succeeded')
        await control.hostExited(job)
        expect(await tasks.settled(root.id, true)).toBe(true)
        await tasks.change(root.id, 'running')
        expect((await store.read(job.id)).status).toBe('succeeded')
        await expect(control.callback(job, 'read', async () => ++calls)).rejects.toBeDefined()
        expect(calls).toBe(1)
    })

    it('retries real callback exit receipts after a database failure without replaying the callback', async () => {
        const job = await start()
        let calls = 0
        jest.spyOn(tasks, 'finishClaim').mockRejectedValueOnce(new Error('database unavailable'))
        await control.callback(job, 'one', async () => ++calls)
        exits.add(job.generation)
        await control.report(job, 'succeeded')
        await control.hostExited(job)
        expect((await store.read(job.id)).capacityHeld).toBe(true)
        await runner.reconcile()
        await control.reconcileOne(job.id)
        expect((await store.read(job.id)).status).toBe('succeeded')
        expect((await store.read(job.id)).capacityHeld).toBe(false)
        expect(calls).toBe(1)
        jest.restoreAllMocks()
    })

    it('does not cancel independent or shared jobs with their parent', async () => {
        const root = await parent()
        await tasks.claim(root.id)
        const attached = await context(root.id, () => start())
        const independent = await context(root.id, () => start('detached'))
        const shared = await context(root.id, () => start('shared'))
        await tasks.change(root.id, 'terminated')
        expect(await tasks.desired(attached.control.taskId)).toBe('terminated')
        for (const job of [independent, shared]) expect(await tasks.desired(job.control.taskId)).toBe('running')
    })

    it('retries failed stop persistence and provider delivery without creating another generation', async () => {
        const job = await start()
        jest.spyOn(tasks, 'change').mockRejectedValueOnce(new Error('database unavailable'))
        await expect(remote.requestStop(job)).rejects.toThrow('database unavailable')
        expect(await tasks.desired(job.control.taskId)).toBe('running')
        await remote.reconcile()
        expect(await tasks.desired(job.control.taskId)).toBe('terminated')
        provider.control.mockRejectedValueOnce(new Error('provider disconnected'))
        await expect(control.reconcileOne(job.id)).rejects.toThrow('provider disconnected')
        expect(await store.read(job.id)).toMatchObject({
            capacityHeld: true,
            finishedAt: null,
            control: { controlFailures: 1, phase: 'creating' }
        })
        exits.add(job.generation)
        await control.report(job, 'cancelled')
        await control.hostExited(job)
        expect(await store.read(job.id)).toMatchObject({
            capacityHeld: false,
            status: 'cancelled',
            generation: job.generation
        })
        expect(await store.jobs.count()).toBe(1)
        jest.restoreAllMocks()
    })

    it('preserves a settled success while cleanup fails and retries only original-target cleanup', async () => {
        const job = await start()
        await store.update(job.id, job.generation, (current) => {
            current.cleanupPending = true
        })
        exits.add(job.generation)
        provider.destroy
            .mockRejectedValueOnce(new Error('cleanup unavailable'))
            .mockRejectedValueOnce(new Error('cleanup unavailable'))
        await control.report(job, 'succeeded')
        await expect(control.hostExited(job)).rejects.toThrow('cleanup unavailable')
        expect(await store.read(job.id)).toMatchObject({
            status: 'succeeded',
            capacityHeld: false,
            cleanupPending: true
        })
        await expect(control.reconcileOne(job.id)).rejects.toThrow('cleanup unavailable')
        expect((await store.read(job.id)).control.controlFailures).toBe(2)
        await remote.reconcileOne(job.id)
        expect(await store.read(job.id)).toMatchObject({ status: 'succeeded', cleanupPending: false })
        expect(provider.destroy).toHaveBeenLastCalledWith(
            expect.objectContaining({ controlTarget: job.control.target })
        )
    })

    it('retains corrupt records without blocking control delivery to other generations', async () => {
        const broken = await start(),
            healthy = await start()
        await store.jobs.update(broken.id, { control: { ...broken.control, version: 99 } as never })
        await control.report(healthy, 'succeeded')
        await store.update(healthy.id, healthy.generation, (current) => {
            current.control.hostExited = true
        })
        exits.add(healthy.generation)
        await control.reconcile()
        expect(await store.read(healthy.id)).toMatchObject({ status: 'succeeded', capacityHeld: false })
        expect(await store.jobs.findOneByOrFail({ id: broken.id })).toMatchObject({
            capacityHeld: true,
            finishedAt: null
        })
    })

    it('does not release capacity on an old deadline, another generation, wrong receipt or absent original host', async () => {
        const job = await start()
        await store.update(job.id, job.generation, (current) => {
            current.hardDeadlineAt = new Date(0)
        })
        await remote.reconcileOne(job.id)
        expect((await store.read(job.id)).capacityHeld).toBe(true)
        await expect(store.update(job.id, randomUUID(), () => undefined)).rejects.toThrow('generation')
        const mismatch = {
            ...job,
            control: {
                ...job.control,
                evidence: sandboxEvidence({ ...job.control.target, generation: randomUUID() }, 'exited')
            }
        }
        expect(() => readControlledSandboxJob(mismatch)).toThrow('target mismatch')
        await expect(remote.hostExited(job)).rejects.toThrow('host changed')
    })

    it('enforces each quota and admits new work only after actual settlement releases its slot', async () => {
        setConfig({ sandboxJobOptions: { globalLimit: 2, tenantLimit: 2, userLimit: 1, capacityPollMs: 250 } })
        const first = (await reserve()).job
        await capacity.acquire(first)
        await capacity.acquire(first) // same generation owns exactly one slot
        const sameUser = (await reserve()).job
        await expect(capacity.acquire(sameUser)).rejects.toMatchObject({ code: 'SANDBOX_CAPACITY_UNAVAILABLE' })
        const second = (await reserve('attached', { ...input(), scope: { ...scope, userId: randomUUID() } })).job
        await capacity.acquire(second)
        const third = (await reserve('attached', { ...input(), scope: { ...scope, userId: randomUUID() } })).job
        await expect(capacity.acquire(third)).rejects.toMatchObject({ code: 'SANDBOX_CAPACITY_UNAVAILABLE' })
        const tenantId = randomUUID()
        await db.query('INSERT INTO tenant(id) VALUES ($1)', [tenantId])
        const otherTenant = (await reserve('attached', { ...input(), scope: { ...scope, tenantId } })).job
        await expect(capacity.acquire(otherTenant)).rejects.toMatchObject({ code: 'SANDBOX_CAPACITY_UNAVAILABLE' })
        await control.report(first, 'failed')
        await control.hostExited(first) // never created: known local admission + actual owner return
        await capacity.acquire(otherTenant)
        expect((await store.read(otherTenant.id)).capacityHeld).toBe(true)
        expect(await store.jobs.countBy({ capacityHeld: true })).toBe(2)
    })

    it('quarantines legacy rows without inventing a receipt and applies migration idempotently', async () => {
        const { job } = await reserve()
        await store.jobs.update(job.id, { control: null, generation: null, status: 'running', capacityHeld: false })
        const sql = readFileSync(path.join(__dirname, 'migration.sql'), 'utf8')
        await db.query(sql)
        await db.query(sql)
        const legacy = await store.read(job.id)
        expect(legacy).toMatchObject({ status: 'unknown', capacityHeld: true, control: null, finishedAt: null })
    })
})

function deferred<T>() {
    let resolve: (value: T) => void
    const promise = new Promise<T>((done) => {
        resolve = done
    })
    return { promise, resolve }
}
