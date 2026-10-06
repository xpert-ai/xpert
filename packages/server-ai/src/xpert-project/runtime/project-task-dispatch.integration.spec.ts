import { reliableReturnIntegrationCases } from '../../handoff/runtime-messaging/testing/reliable-return.cases'
import { runtimeMessageTestSchemas } from '../../handoff/runtime-messaging/testing/runtime-message.schemas'
import { projectTaskDecisionCases } from './testing/project-task-decision.cases'
import { XpertProjectTaskService } from '../services/project-task.service'
jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DataSource, EntitySchema } from 'typeorm'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { QueryBus } from '@nestjs/cqrs'
import {
    AgentInvocationScope,
    RequestContext,
    AgentRuntimeRegistry,
    BUILTIN_GLOBAL_SCOPE,
    DefaultRuntimeCapabilityRegistry,
    IAgentRuntimeStrategy,
    AgentRuntimeObservation,
    ProjectAccessRuntimeCapability
} from '@xpert-ai/plugin-sdk'
import { ProjectTaskDispatchInput } from '@xpert-ai/contracts'
import { XpertProjectTaskExecution } from '../entities/project-task-execution.entity'
import { XpertProjectTask } from '../entities/project-task.entity'
import { XpertProjectTaskStep } from '../entities/project-task-step.entity'
import { XpertProject } from '../entities/project.entity'
import {
    AgentInvocationEntity,
    AgentInvocationEventEntity,
    AgentRuntimeBindingEntity
} from '../../agent-invocation/invocation.entity'
import { TypeOrmAgentInvocationStore } from '../../agent-invocation/typeorm-invocation.store'
import { AgentInvocationRuntime } from '../../agent-invocation/invocation-runtime'
import { AgentInvocationFactoryService } from '../../agent-invocation/invocation-factory.service'
import { ProjectTaskDispatchService } from './project-task-dispatch.service'
import { ProjectTaskRuntimeContextService } from './project-task-runtime-context.service'
import { ProjectTaskCaller } from './project-task-dispatch.schema'

const url = process.env.XPERT_EXECUTION_TEST_DATABASE_URL
const integration = url ? describe : describe.skip
const uuid = { type: 'uuid' as const }
const text = { type: 'varchar' as const }
const nullableText = { ...text, nullable: true }
const json = { type: 'jsonb' as const, nullable: true }
const base = { id: { ...uuid, primary: true }, tenantId: uuid, organizationId: uuid }
const projectBase = { ...base, projectId: uuid, createdById: uuid }
const schemas = [
    ...runtimeMessageTestSchemas,
    new EntitySchema<XpertProject>({
        name: 'XpertProject',
        target: XpertProject,
        tableName: 'xpert_project',
        columns: { ...base, status: text, workspaceId: { ...uuid, nullable: true } }
    }),
    new EntitySchema<XpertProjectTask>({
        name: 'XpertProjectTask',
        target: XpertProjectTask,
        tableName: 'xpert_project_task',
        columns: {
            ...projectBase,
            title: text,
            name: text,
            description: nullableText,
            kind: text,
            status: text,
            revision: { type: 'int', version: true },
            providerKey: nullableText,
            requirements: json,
            decisions: json,
            predecessorIds: json,
            assigneeXpertId: { ...uuid, nullable: true }
        },
        relations: { steps: { type: 'one-to-many', target: 'XpertProjectTaskStep', inverseSide: 'task' } }
    }),
    new EntitySchema<XpertProjectTaskStep>({
        name: 'XpertProjectTaskStep',
        target: XpertProjectTaskStep,
        tableName: 'xpert_project_task_step',
        columns: { id: { ...uuid, primary: true }, taskId: uuid, stepIndex: { type: 'int' }, description: text },
        relations: { task: { type: 'many-to-one', target: 'XpertProjectTask', joinColumn: { name: 'taskId' } } }
    }),
    new EntitySchema<XpertProjectTaskExecution>({
        name: 'XpertProjectTaskExecution',
        target: XpertProjectTaskExecution,
        tableName: 'xpert_project_task_execution',
        columns: {
            ...projectBase,
            taskId: uuid,
            conversationId: uuid,
            threadId: text,
            xpertId: { ...uuid, nullable: true },
            attempt: { type: 'int' },
            status: text,
            invocationId: { ...uuid, nullable: true },
            dispatchRequestId: { ...uuid, nullable: true },
            dispatchState: nullableText,
            projectedTaskRevision: { type: 'int', nullable: true },
            projectedInvocationRevision: { type: 'int', default: -1 },
            dispatchNextAttemptAt: { type: 'timestamptz', nullable: true },
            dispatchError: nullableText,
            createdAt: { type: 'timestamptz', createDate: true },
            specificationSnapshot: json,
            purpose: json,
            dispatchIntent: { ...json, select: false }
        }
    }),
    new EntitySchema<AgentInvocationEntity>({
        name: 'AgentInvocationEntity',
        target: AgentInvocationEntity,
        tableName: 'agent_invocation',
        columns: {
            ...base,
            nextObservationAt: { type: 'timestamptz', nullable: true },
            observationLeaseToken: { ...uuid, nullable: true },
            observationLeaseUntil: { type: 'timestamptz', nullable: true },
            observationError: nullableText,
            ownerId: text,
            revision: { type: 'int' },
            invocation: json,
            providerSource: json
        }
    }),
    new EntitySchema<AgentInvocationEventEntity>({
        name: 'AgentInvocationEventEntity',
        target: AgentInvocationEventEntity,
        tableName: 'agent_invocation_event',
        columns: { ...base, ownerId: text, invocationId: uuid, revision: { type: 'int' }, observation: json }
    }),
    new EntitySchema<AgentRuntimeBindingEntity>({
        name: 'AgentRuntimeBindingEntity',
        target: AgentRuntimeBindingEntity,
        tableName: 'agent_runtime_binding',
        columns: { ...base, title: text, workspaceIds: json, target: json, enabled: { type: 'boolean' } }
    })
]

integration('explicit task delegation / PostgreSQL', () => {
    const schema = `task_dispatch_${randomUUID().replace(/-/g, '')}`
    let database: DataSource
    let store: TypeOrmAgentInvocationStore
    let service: ProjectTaskDispatchService
    let factory: AgentInvocationFactoryService
    let scope: AgentInvocationScope
    let caller: ProjectTaskCaller
    let input: ProjectTaskDispatchInput
    const start = jest.fn<Promise<AgentRuntimeObservation>, Parameters<IAgentRuntimeStrategy['start']>>()
    const strategy: IAgentRuntimeStrategy = {
        capabilities: { recovery: 'session', interactions: false, cancellation: true, background: true },
        start,
        inspect: jest.fn(async () => ({ status: 'running' as const })),
        cancel: jest.fn(async () => ({ status: 'cancelled' as const }))
    }
    const context = Object.assign(
        Object.create(ProjectTaskRuntimeContextService.prototype) as ProjectTaskRuntimeContextService,
        { resolve: jest.fn(async () => structuredClone(scope)) }
    )
    const migration = readFileSync(join(__dirname, '../migrations/20261006-project-task-runtime.sql'), 'utf8')

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
            entities: schemas
        }).initialize()
        await database.query(`
            CREATE TABLE tenant (id uuid PRIMARY KEY);
            CREATE TABLE organization (id uuid PRIMARY KEY);
            CREATE TABLE "user" (id uuid PRIMARY KEY);
            CREATE TABLE xpert_project (id uuid PRIMARY KEY, "tenantId" uuid, "organizationId" uuid, status varchar, "workspaceId" uuid);
            CREATE TABLE xpert_project_task (id uuid PRIMARY KEY, "tenantId" uuid, "organizationId" uuid, "createdById" uuid,
                "projectId" uuid, title varchar, name varchar, description varchar, kind varchar, status varchar, revision int,
                "providerKey" varchar, "predecessorIds" jsonb, "assigneeXpertId" uuid);
            CREATE TABLE xpert_project_task_step (id uuid PRIMARY KEY, "taskId" uuid, "stepIndex" int, description varchar);
            CREATE TABLE xpert_project_task_execution (id uuid PRIMARY KEY, "tenantId" uuid, "organizationId" uuid, "createdById" uuid,
                "projectId" uuid, "taskId" uuid, "conversationId" uuid, "threadId" varchar, "xpertId" uuid, attempt int, status varchar, "createdAt" timestamptz DEFAULT now());
            CREATE TABLE agent_invocation_wait (id uuid PRIMARY KEY, "tenantId" uuid, "organizationId" uuid,
                "ownerId" varchar, state varchar, request jsonb, "nextCheckAt" timestamptz);
        `)
        await database.query(
            readFileSync(join(__dirname, '../../agent-invocation/migrations/20260922-agent-invocation.sql'), 'utf8')
        )
        await database.query(`CREATE TABLE chat_conversation_thread (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "threadId" varchar UNIQUE, "conversationId" uuid, "tenantId" uuid, "organizationId" uuid,
            "createdById" uuid, "updatedById" uuid, "createdAt" timestamptz DEFAULT now(), "updatedAt" timestamptz DEFAULT now(),
            status varchar, "runControl" jsonb, error varchar, operation jsonb, metadata jsonb DEFAULT '{}', "encryptedRunContext" varchar);
            CREATE TABLE chat_conversation (id uuid PRIMARY KEY, "threadId" varchar, "projectId" uuid, "tenantId" uuid, "organizationId" uuid,
            "createdById" uuid, "updatedById" uuid, "createdAt" timestamptz DEFAULT now(), "updatedAt" timestamptz DEFAULT now(), status varchar, operation jsonb);
            CREATE TABLE xpert_agent_execution (id uuid PRIMARY KEY, "threadId" varchar, "agentKey" varchar, "xpertId" uuid, type varchar, status varchar, error varchar,
            "tenantId" uuid, "organizationId" uuid, "createdById" uuid, "updatedById" uuid, "createdAt" timestamptz DEFAULT now(), "updatedAt" timestamptz DEFAULT now());`)
        await database.query(migration)
        const reliable = readFileSync(
            join(__dirname, '../../handoff/runtime-messaging/migrations/20261006-runtime-reliable-replies.sql'),
            'utf8'
        )
        await database.query(reliable)
        await database.query(reliable)
        await database.query(migration) // Re-applying the additive migration preserves existing data and indexes.
        const decisions = readFileSync(join(__dirname, '../migrations/20261006-project-task-decisions.sql'), 'utf8')
        await database.query(decisions)
        await database.query(decisions)
    })
    afterAll(async () => {
        if (database?.isInitialized) {
            await database.query(`DROP SCHEMA ${schema} CASCADE`)
            await database.destroy()
        }
    })
    beforeEach(async () => {
        start.mockReset().mockImplementation(async (_request, runtimeContext) => {
            const attempts = await database
                .getRepository(XpertProjectTaskExecution)
                .findBy({ invocationId: runtimeContext.invocationId })
            expect(attempts).toHaveLength(1) // Independent connection sees the committed attempt before external side effects.
            return { status: 'running', handle: { sessionId: randomUUID(), runId: runtimeContext.invocationId } }
        })
        scope = {
            tenantId: randomUUID(),
            organizationId: randomUUID(),
            userId: randomUUID(),
            workspaceId: randomUUID(),
            projectId: randomUUID(),
            conversationId: randomUUID(),
            parentExecutionId: randomUUID(),
            callerXpertId: randomUUID(),
            callerAgentKey: 'main'
        }
        caller = {
            type: 'xpert',
            executionId: scope.parentExecutionId,
            conversationId: scope.conversationId,
            xpertId: scope.callerXpertId,
            agentKey: 'main',
            threadId: randomUUID(),
            sourceMessageId: 'source'
        }
        input = {
            requestId: randomUUID(),
            taskId: randomUUID(),
            expectedRevision: 1,
            bindingId: randomUUID(),
            instructions: ''
        }
        await database.query('INSERT INTO tenant VALUES ($1)', [scope.tenantId])
        await database.query('INSERT INTO organization VALUES ($1)', [scope.organizationId])
        await database.query('INSERT INTO "user" VALUES ($1)', [scope.userId])
        await database.getRepository(XpertProject).save({
            id: scope.projectId,
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            status: 'active',
            workspaceId: scope.workspaceId
        })
        await database.getRepository(XpertProjectTask).save({
            id: input.taskId,
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            createdById: scope.userId,
            projectId: scope.projectId,
            title: 'Verify totals',
            name: 'verify',
            kind: 'task',
            status: 'todo',
            revision: 1,
            requirements: ['Totals match'],
            predecessorIds: []
        })
        await database.getRepository(AgentRuntimeBindingEntity).save({
            id: input.bindingId,
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            title: 'Test runtime',
            workspaceIds: [scope.workspaceId],
            enabled: true,
            target: {
                bindingId: input.bindingId,
                revision: '1',
                provider: 'test',
                reference: 'test',
                configuration: {}
            }
        })
        store = new TypeOrmAgentInvocationStore(database.getRepository(AgentInvocationEntity))
        const registry = new AgentRuntimeRegistry({} as DiscoveryService, new Reflector())
        registry.register('test', strategy, { kind: 'builtin', scopeKey: BUILTIN_GLOBAL_SCOPE })
        registry.register('opencode', strategy, { kind: 'builtin', scopeKey: BUILTIN_GLOBAL_SCOPE })
        const query = Object.assign(Object.create(QueryBus.prototype) as QueryBus, {
            execute: jest.fn(async () => ({
                agent: {
                    team: {
                        tenantId: scope.tenantId,
                        organizationId: scope.organizationId,
                        workspaceId: scope.workspaceId
                    }
                }
            }))
        })
        const capabilities = new DefaultRuntimeCapabilityRegistry().register(ProjectAccessRuntimeCapability, {
            assertEdit: jest.fn(),
            assertManage: jest.fn(),
            listReadable: jest.fn()
        })
        factory = new AgentInvocationFactoryService(
            database.getRepository(AgentRuntimeBindingEntity),
            query,
            new AgentInvocationRuntime(store, registry),
            capabilities,
            database.getRepository(AgentInvocationEntity)
        )
        service = new ProjectTaskDispatchService(database.getRepository(XpertProjectTaskExecution), context, factory)
    })

    it('dispatches for the built-in Project general agent without fabricating an Assistant ID', async () => {
        scope.callerType = 'project_agent'
        scope.callerAgentKey = 'general_agent'
        delete scope.callerXpertId
        caller = { ...caller, type: 'project_agent', agentKey: 'general_agent' }
        delete caller.xpertId
        const receipt = await service.dispatch(scope.projectId, input, caller)
        const record = await database.getRepository(AgentInvocationEntity).findOneBy({ id: receipt.invocationId })
        expect(record.invocation.request.dispatch.replyTo).toEqual({
            type: 'project_agent',
            projectId: scope.projectId,
            agentKey: 'general_agent',
            conversationId: scope.conversationId,
            threadId: caller.threadId
        })
        expect(record.invocation.scope.callerXpertId).toBeUndefined()
        expect(start).toHaveBeenCalledTimes(1)
    })
    it('rejects a Computer binding without an explicit model source before reserving a Project attempt', async () => {
        scope.callerType = 'project_agent'
        scope.callerAgentKey = 'general_agent'
        delete scope.callerXpertId
        caller = { ...caller, type: 'project_agent', agentKey: 'general_agent' }
        delete caller.xpertId
        const bindings = database.getRepository(AgentRuntimeBindingEntity)
        const binding = await bindings.findOneBy({ id: input.bindingId })
        binding.target.configuration.executionEnvironment = { type: 'computer' }
        await bindings.save(binding)
        await expect(service.dispatch(scope.projectId, input, caller)).rejects.toThrow()
        expect(await database.getRepository(XpertProjectTaskExecution).countBy({ projectId: scope.projectId })).toBe(0)
        expect(start).not.toHaveBeenCalled()
    })
    it('lets the same Assistant observe its Project attempt from a new turn but rejects another conversation', async () => {
        const receipt = await service.dispatch(scope.projectId, input, caller)
        const identity = {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            userId: scope.userId,
            workspaceId: scope.workspaceId,
            projectId: scope.projectId,
            conversationId: scope.conversationId,
            xpertId: scope.callerXpertId,
            agentKey: scope.callerAgentKey,
            executionId: randomUUID()
        }
        const observation = await factory.createScopedApi(identity).inspect(receipt.invocationId)
        expect(observation.id).toBe(receipt.invocationId)
        await expect(
            factory.createScopedApi({ ...identity, conversationId: randomUUID() }).inspect(receipt.invocationId)
        ).rejects.toThrow()
        expect(start).toHaveBeenCalledTimes(1)
    })
    it('blocks a native project handoff while a Runtime attempt holds the Project', async () => {
        await service.dispatch(scope.projectId, input, caller)
        const native = Object.create(XpertProjectTaskService.prototype) as XpertProjectTaskService
        Object.assign(native, { repository: database.getRepository(XpertProjectTask) })
        const tenant = jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(scope.tenantId)
        const org = jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(scope.organizationId)
        try {
            await expect(native.createExecution(scope.projectId, input.taskId, { status: 'queued' })).rejects.toThrow()
            expect(
                await database.getRepository(XpertProjectTaskExecution).countBy({ projectId: scope.projectId })
            ).toBe(1)
        } finally {
            tenant.mockRestore()
            org.mockRestore()
        }
    })
    it('serializes ordinary completion against a concurrent Runtime dispatch', async () => {
        const native = Object.create(XpertProjectTaskService.prototype) as XpertProjectTaskService
        Object.assign(native, {
            repository: database.getRepository(XpertProjectTask),
            projectRepository: { findOne: jest.fn(async () => ({ id: scope.projectId })) }
        })
        const tenant = jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(scope.tenantId)
        const org = jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(scope.organizationId)
        try {
            const results = await Promise.allSettled([
                native.updateTask(scope.projectId, input.taskId, { status: 'done' }),
                service.dispatch(scope.projectId, input, caller)
            ])
            expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
            const task = await database.getRepository(XpertProjectTask).findOneBy({ id: input.taskId })
            const count = await database.getRepository(XpertProjectTaskExecution).countBy({ taskId: input.taskId })
            expect(count).toBe(task.status === 'done' ? 0 : 1)
        } finally {
            tenant.mockRestore()
            org.mockRestore()
        }
    })

    it('does not launch a saved pending intent after the task is cancelled', async () => {
        const scoped = factory.createCapturedApi.bind(factory)
        const failure = jest.spyOn(factory, 'createCapturedApi').mockImplementation((captured) => ({
            ...scoped(captured),
            start: jest.fn(async () => {
                throw new Error('crashed before reservation')
            })
        }))
        await expect(service.dispatch(scope.projectId, input, caller)).rejects.toThrow()
        failure.mockRestore()
        await database.getRepository(XpertProjectTask).update({ id: input.taskId }, { status: 'cancelled' })
        await expect(service.dispatch(scope.projectId, input, caller)).rejects.toThrow()
        expect(start).not.toHaveBeenCalled()
    })
    it('serializes simultaneous identical dispatches and launches the adapter once', async () => {
        const receipts = await Promise.all(
            Array.from({ length: 6 }, () => service.dispatch(scope.projectId, input, caller))
        )
        expect(new Set(receipts.map((receipt) => receipt.invocationId)).size).toBe(1)
        expect(new Set(receipts.map((receipt) => receipt.taskExecutionId)).size).toBe(1)
        expect(start).toHaveBeenCalledTimes(1)
        expect(await database.getRepository(XpertProjectTaskExecution).countBy({ projectId: scope.projectId })).toBe(1)
        expect(
            (await database.getRepository(XpertProjectTaskExecution).findOneBy({ id: receipts[0].taskExecutionId }))
                .dispatchIntent
        ).toBeUndefined()
    })
    it('allows only one of two different requests to acquire the Project', async () => {
        const results = await Promise.allSettled([
            service.dispatch(scope.projectId, input, caller),
            service.dispatch(scope.projectId, { ...input, requestId: randomUUID() }, caller)
        ])
        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
        expect(start).toHaveBeenCalledTimes(1)
    })
    it('recovers a committed intent after a host restart without changing the Invocation identity', async () => {
        const scoped = factory.createCapturedApi.bind(factory)
        const failure = jest.spyOn(factory, 'createCapturedApi').mockImplementation((captured) => ({
            ...scoped(captured),
            start: jest.fn(async () => {
                throw new Error('crashed before reservation')
            })
        }))
        await expect(service.dispatch(scope.projectId, input, caller)).rejects.toThrow('crashed before reservation')
        failure.mockRestore()
        const saved = await database.getRepository(XpertProjectTaskExecution).findOneBy({ projectId: scope.projectId })
        expect(saved.dispatchState).toBe('pending')
        scope.parentExecutionId = randomUUID()
        caller.executionId = scope.parentExecutionId
        service = new ProjectTaskDispatchService(database.getRepository(XpertProjectTaskExecution), context, factory)
        const receipt = await service.dispatch(scope.projectId, input, caller)
        expect(receipt.invocationId).toBe(saved.invocationId)
        expect(receipt.taskExecutionId).toBe(saved.id)
        expect(start).toHaveBeenCalledTimes(1)
    })
    it('does not relaunch after an ambiguous adapter error or a changed parent execution', async () => {
        start.mockRejectedValueOnce(new Error('connection lost after launch'))
        const first = await service.dispatch(scope.projectId, input, caller)
        expect(first.status).toBe('unknown')
        scope.parentExecutionId = randomUUID()
        caller.executionId = scope.parentExecutionId
        expect(await service.dispatch(scope.projectId, input, caller)).toEqual(first)
        expect(start).toHaveBeenCalledTimes(1)
        await expect(service.dispatch(scope.projectId, { ...input, requestId: randomUUID() }, caller)).rejects.toThrow()
    })
    it('persists cancellation confirmation separately and permits an explicit new attempt afterward', async () => {
        const first = await service.dispatch(scope.projectId, input, caller)
        const cancelled = await factory.createCapturedApi(scope).cancel(first.invocationId)
        expect(cancelled.status).toBe('cancelled')
        const second = await service.dispatch(scope.projectId, { ...input, requestId: randomUUID() }, caller)
        expect(second.invocationId).not.toBe(first.invocationId)
        expect(start).toHaveBeenCalledTimes(2)
        expect((await database.getRepository(XpertProjectTask).findOneBy({ id: input.taskId })).status).toBe('todo')
        const attempts = await database
            .getRepository(XpertProjectTaskExecution)
            .find({ where: { taskId: input.taskId }, order: { attempt: 'ASC' } })
        expect(attempts.map((attempt) => attempt.attempt)).toEqual([1, 2])
    })

    reliableReturnIntegrationCases(() => ({ database, store, service, factory, scope, caller, input, start, strategy }))
    projectTaskDecisionCases(() => ({ database, store, service, factory, scope, caller, input, context }))
})
