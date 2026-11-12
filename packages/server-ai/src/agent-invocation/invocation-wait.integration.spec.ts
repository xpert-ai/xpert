import { executionIdentityFixture } from '../shared/testing/execution-identity.fixture'
jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DataSource, EntitySchema, Repository } from 'typeorm'
import { CommandBus, EventBus, QueryBus } from '@nestjs/cqrs'
import { UserType } from '@xpert-ai/contracts'
import { AgentInvocationScope } from '@xpert-ai/plugin-sdk'
import { unknownExecutionControl } from '@xpert-ai/contracts'
import { ExecutionTaskControl, TaskControlStore } from '@xpert-ai/server-core'
import { AgentInvocationRuntime } from './invocation-runtime'
import { TaskControlCoordinator } from './task-control-coordinator.service'
import { User, UserOrganization } from '@xpert-ai/server-core'
import { AgentInvocationEntity, AgentInvocationEventEntity, AgentInvocationWaitEntity } from './invocation.entity'
import { AgentInvocationWaitStore } from './invocation-wait.store'
import { AgentInvocationMonitorService } from './invocation-monitor.service'
import { AgentInvocationFactoryService } from './invocation-factory.service'
import { TypeOrmAgentInvocationStore } from './typeorm-invocation.store'
import { StoredAgentInvocation } from './invocation-store'
import {
    CancelTaskWaitsCommand,
    CancelTaskWaitsHandler,
    CheckTaskWaitClaimHandler,
    CheckTaskWaitClaimQuery
} from './task-wait-control'
import { XpertAgentExecution } from '../xpert-agent-execution/agent-execution.entity'

const url = process.env.XPERT_EXECUTION_TEST_DATABASE_URL
const integration = url ? describe : describe.skip

integration('durable task wait isolation / PostgreSQL', () => {
    const schema = `invocation_wait_${randomUUID().replace(/-/g, '')}`
    const uuid = { type: 'uuid' as const }
    const text = { type: 'varchar' as const }
    const scopedColumns = { id: { ...uuid, primary: true }, tenantId: uuid, organizationId: uuid, ownerId: text }
    const waitSchema = new EntitySchema<AgentInvocationWaitEntity>({
        name: 'AgentInvocationWaitEntity',
        target: AgentInvocationWaitEntity,
        tableName: 'agent_invocation_wait',
        columns: {
            ...scopedColumns,
            threadId: text,
            checkpointNamespace: text,
            state: text,
            request: { type: 'jsonb', nullable: true },
            outcome: { ...text, nullable: true },
            deadlineAt: { type: 'timestamptz', nullable: true },
            unknownSince: { type: 'timestamptz', nullable: true },
            nextCheckAt: { type: 'timestamptz' },
            leaseToken: { ...uuid, nullable: true },
            leaseUntil: { type: 'timestamptz', nullable: true },
            lastError: { ...text, nullable: true }
        }
    })
    const invocationSchema = new EntitySchema<AgentInvocationEntity>({
        name: 'AgentInvocationEntity',
        target: AgentInvocationEntity,
        tableName: 'agent_invocation',
        columns: {
            ...scopedColumns,
            revision: { type: 'int' },
            invocation: { type: 'jsonb' },
            updatedAt: { type: 'timestamptz', updateDate: true },
            providerSource: { type: 'jsonb' },
            nextObservationAt: { type: 'timestamptz', nullable: true }
        }
    })
    const eventSchema = new EntitySchema<AgentInvocationEventEntity>({
        name: 'AgentInvocationEventEntity',
        target: AgentInvocationEventEntity,
        tableName: 'agent_invocation_event',
        columns: {
            ...scopedColumns,
            invocationId: uuid,
            revision: { type: 'int' },
            observation: { type: 'jsonb' }
        }
    })
    let database: DataSource
    let waits: AgentInvocationWaitStore
    let store: TypeOrmAgentInvocationStore
    const events = { publish: jest.fn() }
    const scope: AgentInvocationScope = {
        tenantId: randomUUID(),
        organizationId: randomUUID(),
        userId: randomUUID(),
        parentExecutionId: randomUUID(),
        callerAgentKey: 'leader',
        callerXpertId: randomUUID()
    }
    const legacyId = randomUUID()
    const migrations = [
        '20260922-agent-invocation.sql',
        '20261001-invocation-wait.sql',
        '20261002-task-wait-groups.sql'
    ]
    const apply = (name: string) => database.query(readFileSync(join(__dirname, 'migrations', name), 'utf8'))
    beforeAll(async () => {
        if (!new URL(url).pathname.startsWith('/xpert_execution_test_'))
            throw new Error('Dedicated test database required')
        database = await new DataSource({ type: 'postgres', url }).initialize()
        await database.query(`CREATE SCHEMA ${schema}`)
        await database.destroy()
        database = await new DataSource({
            type: 'postgres',
            url,
            schema,
            extra: { options: `-c search_path=${schema},public` },
            entities: [waitSchema, invocationSchema, eventSchema]
        }).initialize()
        await database.query(
            'CREATE TABLE tenant (id uuid PRIMARY KEY); CREATE TABLE organization (id uuid PRIMARY KEY); CREATE TABLE "user" (id uuid PRIMARY KEY)'
        )
        await database.query('INSERT INTO tenant VALUES ($1)', [scope.tenantId])
        await database.query('INSERT INTO organization VALUES ($1)', [scope.organizationId])
        await database.query('INSERT INTO "user" VALUES ($1)', [scope.userId])
        await database.query(
            'CREATE TABLE xpert_agent_execution (id uuid PRIMARY KEY, "tenantId" uuid, "organizationId" uuid, "createdById" uuid, "threadId" varchar)'
        )
        await database.query('INSERT INTO xpert_agent_execution VALUES ($1,$2,$3,$4,$5)', [
            scope.parentExecutionId,
            scope.tenantId,
            scope.organizationId,
            scope.userId,
            'thread'
        ])
        await apply(migrations[0])
        await database.query('ALTER TABLE agent_invocation ADD COLUMN IF NOT EXISTS "nextObservationAt" timestamptz')
        await apply(migrations[1])
        await database.query(
            'INSERT INTO agent_invocation (id, "tenantId", "organizationId", "ownerId", invocation, "providerSource") VALUES ($1,$2,$3,$4,$5,$6)',
            [
                legacyId,
                scope.tenantId,
                scope.organizationId,
                scope.userId,
                JSON.stringify(record(legacyId).invocation),
                '{}'
            ]
        )
        await database.query(
            'INSERT INTO agent_invocation_wait (id, "tenantId", "organizationId", "ownerId", "threadId", "checkpointNamespace") VALUES ($1,$2,$3,$4,$5,$6)',
            [legacyId, scope.tenantId, scope.organizationId, scope.userId, 'thread', '']
        )
        await apply(migrations[2])
        waits = new AgentInvocationWaitStore(database.getRepository(AgentInvocationWaitEntity))
        store = new TypeOrmAgentInvocationStore(
            database.getRepository(AgentInvocationEntity),
            events as unknown as EventBus
        )
    })
    afterEach(() => events.publish.mockReset())
    afterAll(async () => {
        if (database?.isInitialized) {
            await database.query(`DROP SCHEMA ${schema} CASCADE`)
            await database.destroy()
        }
    })
    function record(id = randomUUID()): StoredAgentInvocation {
        return {
            providerSource: { kind: 'builtin', scopeKey: 'builtin:global' },
            invocation: {
                id,
                revision: 0,
                scope,
                status: 'queued',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                request: {
                    callId: id,
                    target: {
                        bindingId: randomUUID(),
                        provider: 'test',
                        reference: 'profile',
                        revision: '1',
                        configuration: {}
                    },
                    input: { prompt: 'test' }
                }
            }
        }
    }
    async function group(taskId: string = randomUUID(), overrides: Partial<AgentInvocationWaitEntity> = {}) {
        return waits.records.save({
            id: randomUUID(),
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            ownerId: scope.userId,
            threadId: 'thread',
            checkpointNamespace: '',
            state: 'waiting',
            nextCheckAt: new Date(),
            deadlineAt: new Date(Date.now() + 60_000),
            request: { callId: randomUUID(), taskIds: [taskId], mode: 'all', scope },
            ...overrides
        })
    }
    function monitor(inspect: jest.Mock) {
        return new AgentInvocationMonitorService(
            waits,
            database.getRepository(AgentInvocationEntity),
            {
                findOne: async () => ({ id: scope.userId, tenantId: scope.tenantId, type: UserType.USER })
            } as unknown as Repository<User>,
            {} as Repository<XpertAgentExecution>,
            { createScopedApi: () => ({ inspect }) } as unknown as AgentInvocationFactoryService,
            {} as QueryBus,
            { execute: async () => executionIdentityFixture(scope) } as unknown as CommandBus
        )
    }
    it('recovers a historical native cancellation past unrelated writes and retries a lost task receipt', async () => {
        const legacy = record()
        const { invocation } = legacy
        const id = invocation.id
        invocation.status = 'cancelling'
        invocation.request.target.provider = 'xpert'
        invocation.controlAdapter = 'native-graph'
        invocation.controlEvidence = unknownExecutionControl({ kind: 'invocation', id }, 'unsupported')
        invocation.error = 'Stopped by user'
        await store.insert(legacy)
        const task = Object.assign(new ExecutionTaskControl(), {
            id: randomUUID(),
            resourceId: id,
            rootId: randomUUID(),
            claim: randomUUID(),
            kind: 'invocation',
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            state: 'running'
        })
        const tasks = {
            delivery: jest.fn().mockResolvedValue('lease'),
            desired: jest.fn().mockResolvedValue('terminated'),
            settleUnstarted: jest.fn().mockResolvedValue(false),
            settled: jest.fn().mockResolvedValue(true),
            descendants: jest.fn().mockResolvedValue([]),
            delivered: jest.fn(),
            receipt: jest.fn().mockRejectedValueOnce(Error('Lost task acknowledgement')).mockResolvedValue(undefined)
        }
        const runtime = new AgentInvocationRuntime(store, undefined)
        const coordinator = new TaskControlCoordinator(
            tasks as unknown as TaskControlStore,
            database,
            runtime,
            undefined,
            undefined,
            undefined
        )
        await database.query(`CREATE TABLE execution_control ("executionId" uuid,"rootExecutionId" uuid,"graphEnded" boolean,
            desired text,"tenantId" uuid,"organizationId" uuid,"threadId" varchar,work jsonb);
            CREATE TABLE execution_task_control ("parentId" uuid,kind text,"currentExecutionId" varchar,"resourceId" varchar,
            state text,"rootId" uuid,"tenantId" uuid,"organizationId" uuid);
            CREATE TABLE copilot_checkpoint_writes (id uuid PRIMARY KEY,thread_id varchar,"tenantId" uuid,"organizationId" uuid,
            checkpoint_ns text,channel text,type text,value bytea,"createdAt" timestamptz DEFAULT now())`)
        await database.query("INSERT INTO execution_control VALUES ($1,$1,true,'terminated',$2,$3,'thread','[]')", [
            scope.parentExecutionId,
            scope.tenantId,
            scope.organizationId
        ])
        await database.query("INSERT INTO execution_task_control VALUES ($1,'execution',$2,$2,'completed',$3,$4,$5)", [
            task.id,
            id,
            task.rootId,
            scope.tenantId,
            scope.organizationId
        ])
        const interrupt = (status: string) => ({ value: { type: 'agent_invocation', invocationId: id, status } })
        const exact = Buffer.from(JSON.stringify([interrupt('cancelling')]))
        const write = async (key: string, data: Buffer, org = scope.organizationId) =>
            database.query(
                `INSERT INTO copilot_checkpoint_writes (id,thread_id,"tenantId","organizationId",checkpoint_ns,channel,type,value)
            VALUES ($1,'thread',$2,$3,'','__interrupt__','json',$4)`,
                [key, scope.tenantId, org, data]
            )
        await database.query(
            `INSERT INTO copilot_checkpoint_writes (id,thread_id,"tenantId","organizationId",checkpoint_ns,channel,type,value)
            SELECT ('00000000-0000-0000-0000-' || lpad(i::text,12,'0'))::uuid,'thread',$1,$2,'','__interrupt__','json',$3
            FROM generate_series(1,40) i`,
            [scope.tenantId, scope.organizationId, Buffer.from(JSON.stringify(interrupt('waiting')))]
        )
        await write(randomUUID(), exact, randomUUID())
        await write(randomUUID(), Buffer.from('broken JSON ' + id))
        await coordinator.deliver(task)
        expect(tasks.receipt).not.toHaveBeenCalled()
        expect((await store.read(id, scope)).invocation.status).toBe('cancelling')

        await write('ffffffff-ffff-ffff-ffff-ffffffffffff', exact)
        await database.query(`UPDATE execution_control SET work='[{"settled":false}]'`)
        await coordinator.deliver(task)
        expect(tasks.receipt).not.toHaveBeenCalled()
        await database.query(`UPDATE execution_control SET work='[]'`)
        await coordinator.deliver(task)
        expect((await store.read(id, scope)).invocation).toMatchObject({
            status: 'cancelled',
            error: 'Stopped by user',
            controlEvidence: { source: 'native_graph', executionId: id }
        })
        expect(tasks.receipt).toHaveBeenCalledWith(task.id, 'completed', task.claim)
        expect(await runtime.confirmCheckpointCancellation(legacy)).toBe(false)
        await database.query('TRUNCATE copilot_checkpoint_writes')
        await coordinator.deliver(task)
        expect(tasks.receipt).toHaveBeenCalledTimes(2)
        expect(tasks.delivered).toHaveBeenLastCalledWith(task.id, 'lease', null)
        expect((await store.read(id, scope)).invocation.revision).toBe(1)
    })
    it('preserves a single-task checkpoint and supports repeated upgrades and independent group IDs', async () => {
        const legacy = await waits.records.findOneByOrFail({ id: legacyId })
        expect(legacy).toMatchObject({ state: 'waiting', request: null, threadId: 'thread' })
        expect(legacy.deadlineAt).toBeInstanceOf(Date)
        await apply(migrations[2])
        expect((await waits.records.findOneByOrFail({ id: legacyId })).deadlineAt).toEqual(legacy.deadlineAt)
        const independent = await group()
        await waits.records.update(independent.id, { state: 'ready' })
        expect((await waits.records.findOneByOrFail({ id: independent.id })).state).toBe('ready')
    })
    it('allows only one concurrent observer to claim a row', async () => {
        const wait = await group()
        let release: () => void
        const held = new Promise<void>((resolve) => {
            release = resolve
        })
        const inspect = jest.fn(async () => {
            await held
            return { status: 'succeeded' }
        })
        const owner = monitor(inspect),
            competitor = monitor(inspect)
        const first = owner.process(wait)
        while (!inspect.mock.calls.length) await new Promise((resolve) => setTimeout(resolve, 5))
        await competitor.process(wait)
        expect(inspect).toHaveBeenCalledTimes(1)
        release!()
        await first
        expect(await waits.records.findOneByOrFail({ id: wait.id })).toMatchObject({
            state: 'ready',
            leaseToken: null,
            leaseUntil: null
        })
    })
    it('reclaims an expired worker lease without replacing an active one', async () => {
        const old = randomUUID(),
            wait = await group(undefined, { leaseToken: old, leaseUntil: new Date(Date.now() + 60_000) })
        const inspect = jest.fn(async () => ({ status: 'succeeded' }))
        await monitor(inspect).process(wait)
        expect(inspect).not.toHaveBeenCalled()
        await waits.records.update(wait.id, { leaseUntil: new Date(Date.now() - 1) })
        await monitor(inspect).process(wait)
        expect(inspect).toHaveBeenCalledTimes(1)
        expect((await waits.records.findOneByOrFail({ id: wait.id })).state).toBe('ready')
    })
    it('cancellation invalidates a claim and late observers cannot resurrect it or touch another owner', async () => {
        const leaseToken = randomUUID()
        const own = await group(undefined, { state: 'ready', leaseToken, leaseUntil: new Date(Date.now() + 60_000) })
        const other = await group(undefined, { ownerId: randomUUID(), state: 'ready' })
        const claims = new CheckTaskWaitClaimHandler(waits)
        const query = new CheckTaskWaitClaimQuery(own.id, leaseToken, 'thread')
        expect(await claims.execute(query)).toBe(true)
        await new CancelTaskWaitsHandler(waits).execute(new CancelTaskWaitsCommand([scope.parentExecutionId], 'thread'))
        expect(await claims.execute(query)).toBe(false)
        expect((await waits.records.update({ id: own.id, leaseToken }, { state: 'waiting' })).affected).toBe(0)
        expect((await waits.records.findOneByOrFail({ id: own.id })).state).toBe('stale')
        expect((await waits.records.findOneByOrFail({ id: other.id })).state).toBe('ready')
    })
    it('commits completion, history and due-time wake-up atomically and emits only after success', async () => {
        const child = record()
        await store.insert(child)
        const next = {
            ...child,
            invocation: { ...child.invocation, revision: 1, status: 'succeeded' as const, result: { text: 'done' } }
        }
        const wait = await group(child.invocation.id, { nextCheckAt: new Date(Date.now() + 60_000) })
        expect(await store.replace(next, 99)).toBe(false)
        expect(events.publish).not.toHaveBeenCalled()
        expect(await store.replace(next, 0)).toBe(true)
        expect(events.publish).toHaveBeenCalledTimes(1)
        expect((await waits.records.findOneByOrFail({ id: wait.id })).nextCheckAt.getTime()).toBeLessThanOrEqual(
            Date.now()
        )
        expect(
            await database.getRepository(AgentInvocationEventEntity).countBy({ invocationId: child.invocation.id })
        ).toBe(2)
        expect(await store.replace(next, 0)).toBe(false)
        expect(events.publish).toHaveBeenCalledTimes(1)
    })
    it('does not commit an invocation or wake-up when its event append fails', async () => {
        const child = record()
        await store.insert(child)
        const wait = await group(child.invocation.id, { nextCheckAt: new Date(Date.now() + 60_000) })
        // Occupy the next event revision to force a real constraint error inside the transaction.
        await database.getRepository(AgentInvocationEventEntity).insert({
            id: randomUUID(),
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            ownerId: scope.userId,
            invocationId: child.invocation.id,
            revision: 1,
            observation: { status: 'running' }
        })
        const next = {
            ...child,
            invocation: { ...child.invocation, revision: 1, status: 'succeeded' as const, result: { text: 'done' } }
        }
        await expect(store.replace(next, 0)).rejects.toThrow()
        expect((await store.read(child.invocation.id, scope)).invocation.revision).toBe(0)
        expect((await waits.records.findOneByOrFail({ id: wait.id })).nextCheckAt).toEqual(wait.nextCheckAt)
        expect(events.publish).not.toHaveBeenCalled()
    })
    it('keeps a committed result successful when the optional in-process wake-up fails', async () => {
        const child = record()
        await store.insert(child)
        events.publish.mockImplementationOnce(() => {
            throw new Error('local event listener unavailable')
        })
        const next = {
            ...child,
            invocation: { ...child.invocation, revision: 1, status: 'succeeded' as const, result: { text: 'done' } }
        }
        await expect(store.replace(next, 0)).resolves.toBe(true)
        expect((await store.read(child.invocation.id, scope)).invocation.status).toBe('succeeded')
    })
    it('checks every persisted caller dimension before returning a group', async () => {
        const wait = await group()
        await expect(waits.read(wait.id, { ...scope, callerXpertId: randomUUID() })).rejects.toThrow()
        await expect(waits.read(wait.id, { ...scope, projectId: randomUUID() })).rejects.toThrow()
        expect(await waits.read(wait.id, { ...scope, userId: randomUUID() })).toBeNull()
        expect((await waits.read(wait.id, { ...scope, projectId: undefined, workspaceId: undefined })).id).toBe(wait.id)
    })
})
