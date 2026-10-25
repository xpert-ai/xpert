import {
    taskControlTestEntities,
    seedTaskControlScope,
    createTaskControlScopeTables
} from '../../../server/src/task-control/testing/task-control.fixture'
// Disposable PostgreSQL exercises the real locks, persisted receipts and task ancestry.
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DataSource } from 'typeorm'
import { TaskControlStore, TaskControlRejected } from '../../../server/src/task-control/task-control.store'
import { TaskControlRunner } from '../../../server/src/task-control/task-control.runner'
import { ExecutionTaskControl } from '../../../server/src/task-control/task-control.entity'
import { withTaskControl } from '../../../server/src/task-control/task-control.context'
import { AgentInvocationRuntime } from '../agent-invocation/invocation-runtime'
import { MemoryInvocationStore } from '../agent-invocation/invocation-test-store'
import {
    AgentRuntimeRegistry,
    BUILTIN_GLOBAL_SCOPE,
    DefaultRuntimeCapabilityRegistry,
    TaskControlPolicy
} from '@xpert-ai/plugin-sdk'
import { DiscoveryService, Reflector } from '@nestjs/core'

const url = process.env.XPERT_PAUSE_TEST_DATABASE_URL
const integration = url ? describe : describe.skip
integration('phase 2 stable ownership / PostgreSQL', () => {
    const schema = `control2_${randomUUID().replace(/-/g, '')}`
    const scope = { tenantId: randomUUID(), organizationId: randomUUID() }
    let database: DataSource, store: TaskControlStore, runner: TaskControlRunner
    beforeAll(async () => {
        if (!new URL(url!).pathname.endsWith('_test')) throw new Error('Disposable _test database required')
        database = await new DataSource({
            type: 'postgres',
            uuidExtension: 'pgcrypto',
            url,
            schema,
            extra: { options: `-c search_path=${schema}` },
            entities: taskControlTestEntities
        }).initialize()
        await database.query(`CREATE SCHEMA "${schema}"`)
        await createTaskControlScopeTables(database)
        await seedTaskControlScope(database, scope)
        const migration = readFileSync(resolve(__dirname, '../../../server/src/task-control/migration.sql'), 'utf8')
        await database.query(migration)
        await database.query(migration)
        store = new TaskControlStore(database)
        runner = new TaskControlRunner(store)
    })
    afterAll(async () => {
        runner?.onModuleDestroy()
        if (database?.isInitialized) {
            await database.query(`DROP SCHEMA "${schema}" CASCADE`)
            await database.destroy()
        }
    })
    const root = () =>
        store.register({
            ...scope,
            kind: 'execution',
            resourceId: randomUUID(),
            executionId: randomUUID(),
            threadId: randomUUID()
        })
    const child = (parent: ExecutionTaskControl, policy: TaskControlPolicy = 'attached', drainOnPause = false) =>
        store.register({
            ...scope,
            kind: 'managed-queue',
            resourceId: randomUUID(),
            parent: { version: 2, targetId: parent.id },
            policy,
            drainOnPause
        })

    it('serializes termination against registration and closes every admitted descendant', async () => {
        for (let i = 0; i < 8; i++) {
            const parent = await root()
            const results = await Promise.allSettled([child(parent), store.change(parent.id, 'terminated')])
            if (results[0].status === 'fulfilled') {
                expect(await store.desired(results[0].value.id)).toBe('terminated')
                await expect(store.claim(results[0].value.id)).rejects.toMatchObject({ reason: 'terminated' })
            } else expect(results[0].reason).toBeInstanceOf(TaskControlRejected)
            await expect(child(parent)).rejects.toMatchObject({ reason: 'terminated' })
        }
    })

    it('rejects cross-tenant and cross-organization ownership', async () => {
        const parent = await root()
        for (const override of [{ tenantId: randomUUID() }, { organizationId: randomUUID() }]) {
            await expect(
                store.register({
                    ...scope,
                    ...override,
                    kind: 'handoff',
                    resourceId: randomUUID(),
                    parent: { version: 2, targetId: parent.id }
                })
            ).rejects.toMatchObject({ reason: 'scope' })
        }
    })

    it('keeps detached/shared roots and siblings running when one subtree terminates', async () => {
        const parent = await root(),
            attached = await child(parent),
            sibling = await child(parent)
        const detached = await child(parent, 'detached'),
            shared = await child(parent, 'shared'),
            grandchild = await child(attached)
        await store.change(attached.id, 'terminated')
        expect(await store.desired(grandchild.id)).toBe('terminated')
        expect(await store.desired(parent.id)).toBe('running')
        expect(await store.desired(sibling.id)).toBe('running')
        await store.change(parent.id, 'terminated')
        for (const target of [detached, shared]) expect(await store.desired(target.id)).toBe('running')
    })

    it('preserves queued work during pause, claims once after resume and never replays completed handlers', async () => {
        const parent = await root(),
            target = await child(parent),
            body = jest.fn(async () => undefined)
        const ref = { version: 2 as const, targetId: target.id }
        await store.change(parent.id, 'paused')
        await expect(runner.run(ref, body)).rejects.toMatchObject({ reason: 'paused' })
        expect(await store.settled(parent.id, true)).toBe(true)
        await store.change(parent.id, 'running')
        const result = await Promise.allSettled([runner.run(ref, body), runner.run(ref, body)])
        expect(result.filter((item) => item.status === 'fulfilled')).toHaveLength(1)
        expect(body).toHaveBeenCalledTimes(1)
        await expect(runner.run(ref, body)).rejects.toBeInstanceOf(TaskControlRejected)
    })

    it('does not deadlock an admitted parent waiting for a synchronous child during pause', async () => {
        const parent = await root(),
            dependency = await child(parent, 'attached', true),
            later = await child(parent)
        await store.change(parent.id, 'paused')
        expect(await store.settled(parent.id, true)).toBe(false)
        const body = jest.fn(async () => 'saved result')
        await expect(runner.run({ version: 2, targetId: dependency.id }, body)).resolves.toBe('saved result')
        expect(await store.settled(parent.id, true)).toBe(true)
        await store.change(parent.id, 'running')
        await runner.run({ version: 2, targetId: later.id }, body)
        expect(body).toHaveBeenCalledTimes(2)
    })

    it('polls lost cancellation and waits for the actual ignoring handler to exit', async () => {
        const parent = await root(),
            target = await child(parent)
        let entered!: () => void, release!: () => void, signal!: AbortSignal
        const started = new Promise<void>((done) => {
                entered = done
            }),
            gate = new Promise<void>((done) => {
                release = done
            })
        const pending = runner.run({ version: 2, targetId: target.id }, async (control) => {
            signal = control.signal
            entered()
            await gate
        })
        await started
        await store.change(parent.id, 'terminated') // No Redis notification at all.
        await runner.reconcile()
        expect(signal.aborted).toBe(true)
        expect(await store.settled(parent.id, false)).toBe(false)
        expect((await store.read(target.id)).claim).not.toBeNull()
        await expect(new TaskControlStore(database).claim(target.id)).rejects.toMatchObject({ reason: 'terminated' })
        release()
        await pending
        expect(await store.settled(parent.id, false)).toBe(true)
        await expect(store.change(parent.id, 'running')).rejects.toMatchObject({ reason: 'terminated' })
    })

    it('binds resumed attempts to the same tree and fences the old producer', async () => {
        const parent = await root(),
            target = await child(parent),
            next = randomUUID()
        await store.change(parent.id, 'paused')
        await store.receipt(parent.id, 'paused')
        await store.change(parent.id, 'running')
        await database.transaction((tx) => store.bind(parent.currentExecutionId, next, tx))
        expect((await store.execution(next)).id).toBe(parent.id)
        await expect(
            withTaskControl(
                { version: 2, targetId: parent.id },
                () => store.producer(),
                () => parent.currentExecutionId
            )
        ).rejects.toMatchObject({ reason: 'scope' })
        expect(
            await withTaskControl(
                { version: 2, targetId: parent.id },
                () => store.producer(),
                () => next
            )
        ).toEqual({ version: 2, targetId: parent.id })
        await store.change(parent.id, 'terminated')
        expect(await store.desired(target.id)).toBe('terminated')
    })

    it('restores a failed resume without reviving a terminated attempt', async () => {
        const parent = await root(),
            next = randomUUID()
        await database.transaction((tx) => store.bind(parent.currentExecutionId, next, tx))
        await database.transaction((tx) => store.restoreAttempt(next, parent.currentExecutionId, tx))
        expect((await store.execution(next)).currentExecutionId).toBe(parent.currentExecutionId)
        await store.change(parent.id, 'terminated')
        await expect(
            database.transaction((tx) => store.restoreAttempt(parent.currentExecutionId, next, tx))
        ).rejects.toMatchObject({ reason: 'terminated' })
    })

    it('does not let an old pause receipt override termination or a child resume before its parent', async () => {
        const parent = await root(),
            target = await child(parent)
        await store.change(parent.id, 'paused')
        await expect(database.transaction((tx) => store.assertAncestorsRunning(target.id, tx))).rejects.toMatchObject({
            reason: 'paused'
        })
        await store.change(parent.id, 'terminated')
        await store.receipt(target.id, 'paused')
        expect((await store.read(target.id)).state).not.toBe('paused')
    })

    it('persists publication atomically and accepts an identical JSONB payload after restart', async () => {
        const parent = await root()
        const input = {
            ...scope,
            kind: 'managed-queue' as const,
            resourceId: randomUUID(),
            parent: { version: 2 as const, targetId: parent.id }
        }
        const first = await store.publish(input, { z: 2, a: 1 })
        const second = await new TaskControlStore(database).publish(input, { a: 1, z: 2 })
        expect(second.id).toBe(first.id)
        expect((await store.publications('managed-queue')).filter((item) => item.targetId === first.id)).toHaveLength(1)
        await expect(store.publish(input, { a: 2 })).rejects.toMatchObject({ reason: 'scope' })
        await store.receipt(first.id, 'completed')
        await store.receipt(parent.id, 'completed')
        expect((await store.publish(input, { a: 1, z: 2 })).state).toBe('completed')
    })

    it('uses the original invocation and result after the parent execution changes', async () => {
        const parent = await root(),
            next = randomUUID()
        const registry = new AgentRuntimeRegistry({} as DiscoveryService, new Reflector())
        const start = jest.fn().mockResolvedValue({ status: 'running', handle: { runId: 'original' } })
        registry.register(
            'test',
            {
                capabilities: { recovery: 'session', background: true, cancellation: true, interactions: false },
                start,
                inspect: jest.fn(),
                cancel: jest.fn().mockResolvedValue({ status: 'cancelled' })
            },
            { kind: 'builtin', scopeKey: BUILTIN_GLOBAL_SCOPE }
        )
        const runtime = new AgentInvocationRuntime(new MemoryInvocationStore(), registry, undefined, store)
        const access = {
            scope: {
                ...scope,
                userId: randomUUID(),
                callerAgentKey: 'main',
                parentExecutionId: parent.currentExecutionId
            },
            capabilities: new DefaultRuntimeCapabilityRegistry(),
            authorize: async () => undefined
        }
        const request = {
            callId: 'stable-call',
            target: { bindingId: 'binding', provider: 'test', reference: 'agent', revision: '1', configuration: {} },
            input: { prompt: 'test' }
        }
        const original = await runtime.scoped(access).start(request)
        await database.transaction((tx) => store.bind(parent.currentExecutionId, next, tx))
        const resumed = await runtime
            .scoped({ ...access, scope: { ...access.scope, parentExecutionId: next } })
            .start(request)
        expect(resumed.id).toBe(original.id)
        expect(start).toHaveBeenCalledTimes(1)
        await runtime.scoped(access).cancel(original.id)
        await expect(
            runtime.scoped({ ...access, scope: { ...access.scope, parentExecutionId: next } }).start(request)
        ).resolves.toMatchObject({ status: 'cancelled' })
        expect(start).toHaveBeenCalledTimes(1)
    })
    it('blocks continuation admission after pause or termination and preserves failed handler evidence', async () => {
        const parent = await root(),
            target = await child(parent),
            reserve = jest.fn(async () => undefined)
        await store.change(parent.id, 'paused')
        await expect(store.admitContinuation(target.id, reserve)).rejects.toMatchObject({ reason: 'paused' })
        await store.change(parent.id, 'running')
        await store.admitContinuation(target.id, reserve)
        const body = jest.fn(async () => {
            throw new Error('Business failure')
        })
        await expect(runner.run({ version: 2, targetId: target.id }, body)).rejects.toThrow('Business failure')
        expect((await store.read(target.id)).outcome).toBe('failed')
        await store.change(parent.id, 'terminated')
        await expect(store.admitContinuation(target.id, reserve)).rejects.toMatchObject({ reason: 'terminated' })
        expect(reserve).toHaveBeenCalledTimes(1)
        expect(body).toHaveBeenCalledTimes(1)
    })
})
