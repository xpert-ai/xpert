// Exercise actor hydration through real workspace authorization, invocation control and delivery.
// Only persistence and queue I/O are substituted; user relations follow the requested TypeORM query.
jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { randomUUID } from 'node:crypto'
import { QueryBus } from '@nestjs/cqrs'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { DataSource, EntityManager, FindOneOptions, Repository } from 'typeorm'
import { AIPermissionsEnum, TaskControlIntent, UserType } from '@xpert-ai/contracts'
import {
    ExecutionTaskControl,
    Role,
    RolePermission,
    TaskControlStore,
    User,
    UserOrganization
} from '@xpert-ai/server-core'
import {
    AgentInvocation,
    AgentRuntimeRegistry,
    BUILTIN_GLOBAL_SCOPE,
    DefaultRuntimeCapabilityRegistry,
    RequestContext,
    agentRuntimeEventMessageId
} from '@xpert-ai/plugin-sdk'
import { AgentInvocationEntity, AgentRuntimeBindingEntity } from '../../agent-invocation/invocation.entity'
import { AgentInvocationFactoryService } from '../../agent-invocation/invocation-factory.service'
import { AgentInvocationRuntime } from '../../agent-invocation/invocation-runtime'
import { MemoryInvocationStore } from '../../agent-invocation/invocation-test-store'
import { ManagedRuntimeService } from '../../agent-invocation/managed/managed-runtime.service'
import { TaskControlCoordinator } from '../../agent-invocation/task-control-coordinator.service'
import { ChatConversation } from '../../chat-conversation/conversation.entity'
import { XpertAgentExecution } from '../../xpert-agent-execution/agent-execution.entity'
import { XpertAgent } from '../../xpert-agent/xpert-agent.entity'
import { Xpert } from '../../xpert/xpert.entity'
import { XpertService } from '../../xpert/xpert.service'
import { GetXpertWorkflowQuery } from '../../xpert/queries/get-xpert-workflow.query'
import { GetXpertWorkflowHandler } from '../../xpert/queries/handlers/get-xpert-workflow.handler'
import { XpertWorkspace } from '../../xpert-workspace/workspace.entity'
import { XpertWorkspaceAccessService } from '../../xpert-workspace/workspace-access.service'
import { HandoffQueueService } from '../message-queue.service'
import { RuntimeMessageAccessService } from './runtime-message-access.service'
import { RuntimeMessageTransportService } from './runtime-message-transport.service'
import { RuntimeMessageContinuationService } from './runtime-message-continuation.service'
import { AgentRuntimeDelivery, AgentRuntimeInbox } from './runtime-message.entity'
import { runtimeObservationEvent } from './runtime-message-outbox'

async function fixture(intent: TaskControlIntent = 'terminated') {
    const scope = {
        tenantId: randomUUID(),
        organizationId: randomUUID(),
        userId: randomUUID(),
        workspaceId: randomUUID(),
        conversationId: randomUUID(),
        parentExecutionId: randomUUID(),
        callerXpertId: randomUUID(),
        callerAgentKey: 'main'
    }
    const database = new DataSource({ type: 'postgres' })
    const manager = new EntityManager(database)
    const grant = new RolePermission({ permission: AIPermissionsEnum.CHAT_VIEW, enabled: true })
    const persistedUser = new User({
        id: scope.userId,
        tenantId: scope.tenantId,
        type: UserType.USER,
        role: new Role({ name: 'runtime-user', rolePermissions: [grant] })
    })
    const membership = new UserOrganization({ userId: scope.userId, isActive: true })
    const users = new Repository(User, manager)
    const loadUser = jest.spyOn(users, 'findOne').mockImplementation(async (options: FindOneOptions<User>) => {
        expect(options.where).toEqual({ id: scope.userId, tenantId: scope.tenantId })
        const user = structuredClone(persistedUser)
        if (user.role && (!Array.isArray(options.relations) || !options.relations.includes('role.rolePermissions')))
            delete user.role.rolePermissions
        return user
    })
    const members = new Repository(UserOrganization, manager)
    jest.spyOn(members, 'findOne').mockImplementation(async (options) => {
        expect(options.where).toEqual({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            userId: scope.userId,
            isActive: true,
            organization: { isActive: true }
        })
        return membership.isActive ? membership : null
    })
    const workspace = new XpertWorkspace({
        id: scope.workspaceId,
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        ownerId: scope.userId
    })
    const workspaces = new Repository(XpertWorkspace, manager)
    jest.spyOn(workspaces, 'findOne').mockResolvedValue(workspace)
    const workspaceAccess = new XpertWorkspaceAccessService(workspaces)
    const assistant = new Xpert({
        id: scope.callerXpertId,
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        agent: new XpertAgent({ key: scope.callerAgentKey }),
        agents: [],
        executors: [],
        graph: { nodes: [], connections: [] }
    })
    const assistants = new Repository(Xpert, manager)
    jest.spyOn(assistants, 'findOne').mockResolvedValue(assistant)
    const service = new XpertService(
        assistants,
        workspaceAccess,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined
    )
    const workflow = new GetXpertWorkflowHandler(service, undefined, undefined)
    const queries = Object.assign(Object.create(QueryBus.prototype) as QueryBus, {
        execute: jest.fn((query: GetXpertWorkflowQuery) => workflow.execute(query))
    })
    const target = { bindingId: randomUUID(), provider: 'test', reference: 'test', revision: '1', configuration: {} }
    const binding = new AgentRuntimeBindingEntity({
        id: target.bindingId,
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        enabled: true,
        target,
        workspaceIds: [scope.workspaceId]
    })
    const bindings = new Repository(AgentRuntimeBindingEntity, manager)
    jest.spyOn(bindings, 'findOneBy').mockImplementation(async () => (binding.enabled ? binding : null))
    const invocation: AgentInvocation = {
        id: randomUUID(),
        scope,
        status: 'failed',
        revision: 3,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        request: {
            target,
            callId: 'call',
            input: { prompt: 'test' },
            dispatch: {
                version: 1,
                requestId: randomUUID(),
                sourceMessageId: 'source',
                replyTo: {
                    xpertId: scope.callerXpertId,
                    agentKey: scope.callerAgentKey,
                    conversationId: scope.conversationId,
                    threadId: 'thread'
                }
            }
        }
    }
    const registry = new AgentRuntimeRegistry({} as DiscoveryService, new Reflector())
    const provider = {
        capabilities: { recovery: 'checkpoint' as const, background: true, cancellation: true, interactions: false },
        start: jest.fn(),
        inspect: jest.fn(),
        cancel: jest.fn()
    }
    const providerSource = { kind: 'builtin' as const, scopeKey: BUILTIN_GLOBAL_SCOPE }
    registry.register('test', provider, providerSource)
    const store = new MemoryInvocationStore()
    await store.insert({ invocation, providerSource })
    const runtime = new AgentInvocationRuntime(store, registry)
    const factory = new AgentInvocationFactoryService(
        bindings,
        queries,
        runtime,
        new DefaultRuntimeCapabilityRegistry(),
        new ManagedRuntimeService(bindings, registry, undefined, queries, undefined)
    )
    const record = new AgentInvocationEntity({
        id: invocation.id,
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        ownerId: scope.userId,
        invocation,
        providerSource
    })
    const records = new Repository(AgentInvocationEntity, manager)
    jest.spyOn(records, 'findOneBy').mockResolvedValue(record)
    const conversation = new ChatConversation({
        id: scope.conversationId,
        threadId: 'thread',
        createdById: scope.userId
    })
    const conversations = new Repository(ChatConversation, manager)
    jest.spyOn(conversations, 'findOneBy').mockResolvedValue(conversation)
    const parent = new XpertAgentExecution({
        id: scope.parentExecutionId,
        xpertId: scope.callerXpertId,
        threadId: 'thread'
    })
    const parents = new Repository(XpertAgentExecution, manager)
    jest.spyOn(parents, 'findOneBy').mockResolvedValue(parent)
    const event = runtimeObservationEvent(invocation)
    const delivery = new AgentRuntimeDelivery({
        id: randomUUID(),
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        ownerId: scope.userId,
        invocationId: invocation.id,
        messageId: agentRuntimeEventMessageId(event),
        event,
        state: 'pending',
        attempts: 0
    })
    const inbox = new AgentRuntimeInbox({ ...delivery, id: randomUUID(), phase: null, claim: null })
    const updates = jest.fn(async (_where: unknown, update: Partial<AgentRuntimeDelivery>) => {
        Object.assign(delivery, update)
        return { affected: 1 }
    })
    const query = {
        update: () => ({
            set: () => ({ where: () => ({ andWhere: () => ({ execute: async () => ({ affected: 1 }) }) }) })
        })
    }
    const deliveries = { createQueryBuilder: () => query, update: updates }
    const inboxes = {
        createQueryBuilder: () => query,
        update: jest.fn(async (_where: unknown, update: Partial<AgentRuntimeInbox>) => Object.assign(inbox, update)),
        findOne: async () => inbox,
        findOneBy: async () => inbox
    }
    Object.assign(database, {
        getRepository: (entity: unknown) => {
            if (entity === User) return users
            if (entity === UserOrganization) return members
            if (entity === AgentInvocationEntity) return records
            if (entity === ChatConversation) return conversations
            if (entity === XpertAgentExecution) return parents
            if (entity === AgentRuntimeDelivery) return deliveries
            if (entity === AgentRuntimeInbox) return inboxes
            throw new Error('Unexpected repository')
        },
        transaction: async (work: (transaction: EntityManager) => Promise<unknown>) => work(manager)
    })
    Object.assign(manager, {
        getRepository: (entity: unknown) => {
            if (entity === AgentRuntimeInbox) return inboxes
            throw new Error('Unexpected transaction repository')
        }
    })
    const access = new RuntimeMessageAccessService(database, factory)
    const enqueue = jest.fn(async () => undefined)
    const queue = Object.assign(Object.create(HandoffQueueService.prototype) as HandoffQueueService, { enqueue })
    const transport = new RuntimeMessageTransportService(database, access, queue, undefined)
    const task = new ExecutionTaskControl({
        id: randomUUID(),
        rootId: randomUUID(),
        kind: 'invocation',
        resourceId: invocation.id,
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        state: 'running',
        policy: 'attached'
    })
    task.parentId = task.rootId
    task.ancestors = [task.rootId, task.id]
    const receipt = jest.fn(async (_id: string, state: ExecutionTaskControl['state']) => {
        task.state = state
    })
    const delivered = jest.fn(async (_id: string, _token: string, observation: string | null) => {
        task.observation = observation
    })
    const tasks = Object.assign(new TaskControlStore(database), {
        delivery: async () => 'lease',
        desired: async () => intent,
        settleUnstarted: async () => false,
        descendants: async () => [task],
        receipt,
        delivered
    })
    const coordinator = new TaskControlCoordinator(tasks, database, runtime, factory, access, undefined)
    const continuation = new RuntimeMessageContinuationService(database, access, undefined, tasks)
    return {
        scope,
        grant,
        persistedUser,
        membership,
        workspace,
        binding,
        loadUser,
        provider,
        access,
        transport,
        enqueue,
        delivery,
        task,
        tasks,
        receipt,
        delivered,
        coordinator,
        continuation,
        inbox,
        invocation
    }
}

describe('background actor reconciliation', () => {
    it('delivers a failed result with freshly loaded permissions', async () => {
        const f = await fixture()
        await f.transport.deliver(f.delivery)
        expect(f.enqueue).toHaveBeenCalledWith(
            expect.objectContaining({
                businessKey: f.invocation.id,
                payload: expect.objectContaining({ kind: 'result', status: 'failed' }),
                headers: expect.objectContaining({ userId: f.scope.userId, organizationId: f.scope.organizationId })
            })
        )
        expect(f.delivery.lastError).toBeNull()
        expect(f.provider.start).not.toHaveBeenCalled()
        expect(f.provider.inspect).not.toHaveBeenCalled()
        expect(f.provider.cancel).not.toHaveBeenCalled()
    })

    it.each<TaskControlIntent>(['running', 'terminated'])(
        'settles a failed attached invocation with %s intent',
        async (intent) => {
            const f = await fixture(intent)
            expect(await f.tasks.settled(f.task.rootId, false)).toBe(false)
            await f.coordinator.deliver(f.task)
            expect(f.receipt).toHaveBeenCalledWith(f.task.id, 'completed')
            expect(await f.tasks.settled(f.task.rootId, false)).toBe(true)
            expect(f.task.observation).toBeNull()
            expect(f.provider.start).not.toHaveBeenCalled()
            expect(f.provider.inspect).not.toHaveBeenCalled()
            expect(f.provider.cancel).not.toHaveBeenCalled()
        }
    )

    it.each(['disabled', 'revoked', 'missing-role', 'membership', 'workspace', 'binding'] as const)(
        'rechecks current %s access for delivery and control',
        async (change) => {
            const f = await fixture()
            // Establish that the exact actor/target was authorized before the change.
            expect(
                await f.access.withActor(f.scope, async () => RequestContext.hasPermission(AIPermissionsEnum.CHAT_VIEW))
            ).toBe(true)
            if (change === 'disabled') f.grant.enabled = false
            if (change === 'revoked') f.persistedUser.role.rolePermissions = []
            if (change === 'missing-role') f.persistedUser.role = null
            if (change === 'membership') f.membership.isActive = false
            if (change === 'workspace') f.workspace.organizationId = randomUUID()
            if (change === 'binding') f.binding.enabled = false
            await f.coordinator.deliver(f.task)
            await f.transport.deliver(f.delivery)
            await f.continuation.consume(f.inbox)
            const reason =
                change === 'membership'
                    ? 'http_403'
                    : change === 'binding'
                      ? 'authorization_failed:invocation_NotFound'
                      : 'authorization_failed:http_403'
            expect(f.receipt).not.toHaveBeenCalled()
            expect(await f.tasks.settled(f.task.rootId, false)).toBe(false)
            expect(f.task.observation).toBe(`control_unconfirmed:${reason}`)
            expect(f.delivery.state).toBe('blocked')
            expect(f.delivery.lastError).toBe(`access_or_target_changed:${reason}`)
            expect(f.inbox.state).toBe('blocked')
            expect(f.inbox.lastError).toBe(`access_or_target_changed:${reason}`)
            expect(f.enqueue).not.toHaveBeenCalled()
            expect(f.provider.start).not.toHaveBeenCalled()
            expect(f.provider.cancel).not.toHaveBeenCalled()
        }
    )
})
