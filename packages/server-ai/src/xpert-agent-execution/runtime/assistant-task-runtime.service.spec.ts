import { unknownExecutionControl } from '@xpert-ai/contracts'
jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))

import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { DiscoveryService, ModuleRef, Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import {
    IXpert,
    XpertTypeEnum,
    XpertAgentExecutionStatusEnum,
    TChatConversationStatus,
    SecretTokenBindingType
} from '@xpert-ai/contracts'
import {
    AgentMiddlewareAssistantTaskInput,
    AgentRuntimeRegistry,
    BUILTIN_GLOBAL_SCOPE,
    DefaultRuntimeCapabilityRegistry,
    RequestContext,
    runWithRequestContext
} from '@xpert-ai/plugin-sdk'
import { NEVER, Observable } from 'rxjs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { VolumeHandle } from '../../shared/volume/volume'
import { VolumeWorkspaceStorage } from '../../shared/volume/workspace-storage'
import { DataSource, Repository, type FindOneOptions } from 'typeorm'
import { ForbiddenException } from '@nestjs/common'
import { Xpert } from '../../xpert/xpert.entity'
import { publishedAgentDelegation } from '../../xpert/published-agent/with-published-agent'
import {
    GetAccessiblePublishedXpertHandler,
    GetAccessiblePublishedXpertQuery
} from '../../xpert/published-agent/get-accessible-published-xpert.query'
import { AssistantTaskRuntimeStrategy } from '../../agent-invocation/assistant-task-adapter'
import { AgentInvocationRuntime } from '../../agent-invocation/invocation-runtime'
import { MemoryInvocationStore } from '../../agent-invocation/invocation-test-store'
import { NativeAgentInvocationReader } from '../../agent-invocation/native-invocation-reader'
import { ChatConversationUpsertCommand } from '../../chat-conversation/commands/upsert.command'
import { ChatExecutionAdmissionService } from '../../chat-conversation/chat-execution-admission.service'
import { ChatConversation } from '../../chat-conversation/conversation.entity'
import { ChatConversationThread } from '../../chat-conversation/conversation-thread.entity'
import { ThreadRunControlService } from '../../chat-conversation/thread-run-control.service'
import { PublishedXpertAccessService } from '../../xpert/published-xpert-access.service'
import { XpertChatCommand } from '../../xpert/commands/chat.command'
import { FindXpertQuery } from '../../xpert/queries/get-one.query'
import { GetXpertWorkflowQuery } from '../../xpert/queries/get-xpert-workflow.query'
import { XpertAgentExecutionUpsertCommand } from '../commands/upsert.command'
import { XpertAgentExecutionOneQuery } from '../queries/get-one.query'
import { AssistantTaskRuntimeService } from './assistant-task-runtime.service'
import {
    AuthorizePipelineNativeExecutionCommand,
    PreparePipelineNativeExecutionCommand
} from '../../xpert-project/pipeline/runtime/pipeline-native-grant.command'

function fixture(external: boolean) {
    const callerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const targetId = external ? 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' : callerId
    const target: IXpert = {
        id: targetId,
        name: 'Executor',
        slug: 'executor',
        type: XpertTypeEnum.Agent,
        tenantId: 'tenant',
        organizationId: 'organization',
        workspaceId: 'executor-workspace',
        version: '1',
        publishAt: new Date('2026-09-01'),
        agent: { key: 'executor' },
        graph: { nodes: [], connections: [] },
        options: {
            templateSource: {
                templateId: '@xpert-ai/test:executor',
                pluginName: '@xpert-ai/test',
                templateKey: 'executor'
            }
        }
    }
    const caller: IXpert = external
        ? {
              ...target,
              id: callerId,
              workspaceId: 'caller-workspace',
              agent: { key: 'caller' },
              graph: {
                  nodes: [{ type: 'xpert', key: targetId, entity: target, position: { x: 0, y: 0 } }],
                  connections: [{ key: 'caller-executor', type: 'xpert', from: 'caller', to: targetId, required: true }]
              }
          }
        : target
    const queries = {
        execute: jest.fn(async (query: unknown): Promise<unknown> => {
            if (query instanceof GetAccessiblePublishedXpertQuery) return accessHandler.execute(query)
            if (query instanceof FindXpertQuery) return query.conditions.id === callerId ? caller : target
            if (query instanceof GetXpertWorkflowQuery) {
                const xpert = query.id === callerId ? caller : target
                return { agent: { ...xpert.agent, team: xpert }, graph: xpert.graph }
            }
            throw new Error(`Unexpected query: ${query?.constructor.name}`)
        })
    }
    const nativeAuthorize = jest.fn(),
        nativePrepare = jest.fn()
    const chat = jest.fn(async (_command: XpertChatCommand): Promise<Observable<MessageEvent>> => NEVER)
    const commands = {
        execute: jest.fn(async (command: unknown) => {
            if (command instanceof AuthorizePipelineNativeExecutionCommand) return nativeAuthorize(command.input)
            if (command instanceof PreparePipelineNativeExecutionCommand) return nativePrepare(command.input)
            if (command instanceof ChatConversationUpsertCommand) return { ...command.entity, threadId: 'thread' }
            if (command instanceof XpertAgentExecutionUpsertCommand) return command.execution
            if (command instanceof XpertChatCommand) return chat(command)
            throw new Error(`Unexpected command: ${command?.constructor.name}`)
        })
    }
    const store = new MemoryInvocationStore()
    const registry = new AgentRuntimeRegistry({} as DiscoveryService, new Reflector())
    registry.register('xpert-task', new AssistantTaskRuntimeStrategy(), {
        kind: 'builtin',
        scopeKey: BUILTIN_GLOBAL_SCOPE
    })
    const runtime = new AgentInvocationRuntime(store, registry)
    const published = jest.fn(
        async (_id: string, _options?: Omit<FindOneOptions<Xpert>, 'where'>): Promise<IXpert> => target
    )
    const accessHandler = new GetAccessiblePublishedXpertHandler({
        getAccessiblePublishedXpert: published
    } as unknown as PublishedXpertAccessService)
    const dependencies = new Map<unknown, unknown>([
        [AgentInvocationRuntime, runtime],
        [PublishedXpertAccessService, { getAccessiblePublishedXpert: published }]
    ])
    const taskControls = { execution: jest.fn().mockResolvedValue(null) }
    const service = new AssistantTaskRuntimeService(
        commands as unknown as CommandBus,
        queries as unknown as QueryBus,
        { get: (token: unknown) => dependencies.get(token) } as ModuleRef,
        taskControls as never,
        { read: jest.fn(async (id: string) => unknownExecutionControl({ kind: 'execution', id })) } as never
    )
    const reader = new NativeAgentInvocationReader(
        queries as unknown as QueryBus,
        new DefaultRuntimeCapabilityRegistry()
    )
    const input: AgentMiddlewareAssistantTaskInput = {
        xpertId: callerId,
        agentKey: 'executor',
        prompt: 'Run the task',
        clientMessageId: 'operation-1',
        ...(external
            ? {
                  target: {
                      kind: 'external_assistant',
                      requesterXpertId: callerId,
                      requesterAgentKey: 'caller',
                      expectation: { pluginName: '@xpert-ai/test', templateKey: 'executor', agentKey: 'executor' }
                  }
              }
            : {})
    }
    return {
        service,
        reader,
        store,
        caller,
        target,
        input,
        commands,
        chat,
        queries,
        published,
        dependencies,
        nativeAuthorize,
        nativePrepare,
        taskControls
    }
}

/** Real audience and live grant checks; only persistence is replaced. */
function delegatedFixture() {
    const f = fixture(true)
    const principal = Object.freeze({
        principalType: 'client_secret' as const,
        clientSecretBindingType: SecretTokenBindingType.USER_XPERT,
        requestedOrganizationId: 'organization',
        requestedUserId: 'user',
        resourceScope: Object.freeze({ kind: 'assistant' as const, xpertId: f.caller.id })
    })
    jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(principal)
    const qb = {
        leftJoin: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn(async () => 1)
    }
    const repository = {
        findOne: jest.fn(async ({ where }: { where: { id: string } }) =>
            where.id === f.caller.id ? f.caller : where.id === f.target.id ? f.target : null
        ),
        createQueryBuilder: jest.fn(() => qb)
    }
    const access = new PublishedXpertAccessService(repository as unknown as Repository<Xpert>)
    f.published.mockImplementation((id, options) => access.getAccessiblePublishedXpert(id, options))
    f.dependencies.set(PublishedXpertAccessService, access)
    return { ...f, access, qb, principal }
}

describe('Assistant Task workspace scope', () => {
    beforeEach(() => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('organization')
    })
    afterEach(() => jest.restoreAllMocks())

    it('dispatches and subscribes a verified external task under the exact USER_XPERT delegation', async () => {
        const f = delegatedFixture()
        await expect(f.access.getAccessiblePublishedXpert(f.target.id)).rejects.toThrow(ForbiddenException)
        const observed: string[] = []
        let background: Promise<void> = Promise.resolve()
        let resume: () => void
        const afterReceipt = new Promise<void>((resolve) => {
            resume = resolve
        })
        f.chat.mockImplementation(async () => {
            await expect(f.access.getAccessiblePublishedXpert(f.target.id)).resolves.toMatchObject({ id: f.target.id })
            return new Observable(() => {
                // Subscription and async work must inherit the server-only context.
                background = Promise.resolve().then(async () => {
                    await afterReceipt
                    observed.push((await f.access.getAccessiblePublishedXpert(f.target.id)).id)
                    expect(RequestContext.currentApiPrincipal()).toBe(f.principal)
                    await expect(f.access.getAccessiblePublishedXpert('unrelated')).rejects.toThrow(ForbiddenException)
                    f.qb.getCount.mockResolvedValue(0)
                    await expect(f.access.getAccessiblePublishedXpert(f.target.id)).rejects.toThrow(ForbiddenException)
                })
            })
        })
        const receipt = await f.service.startTask(f.input)
        await expect(f.access.getAccessiblePublishedXpert(f.target.id)).rejects.toThrow(ForbiddenException)
        resume()
        await background
        expect(receipt).toMatchObject({ status: 'running', executorXpertId: f.target.id, executorAgentKey: 'executor' })
        expect(observed).toEqual([f.target.id])
        expect(publishedAgentDelegation()).toBeUndefined()
        expect(RequestContext.currentApiPrincipal()).toBe(f.principal)
        await expect(f.access.getAccessiblePublishedXpert(f.target.id)).rejects.toThrow(ForbiddenException)
    })

    it.each(['revoked', 'foreign-audience', 'missing-edge', 'cross-organization'] as const)(
        'does not create a task or elevate access when the external target is %s',
        async (reason) => {
            const f = delegatedFixture()
            if (reason === 'revoked') f.qb.getCount.mockResolvedValue(0)
            if (reason === 'foreign-audience')
                jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue({
                    ...f.principal,
                    resourceScope: { kind: 'assistant', xpertId: 'another-parent' }
                })
            if (reason === 'missing-edge') f.caller.graph.connections = []
            if (reason === 'cross-organization') f.target.organizationId = 'other-organization'
            const receipt = await f.service.startTask(f.input).catch(() => null)
            expect(receipt?.status).not.toBe('running')
            expect(f.chat).not.toHaveBeenCalled()
            expect(f.commands.execute).not.toHaveBeenCalled()
            expect(publishedAgentDelegation()).toBeUndefined()
        }
    )

    it('preserves a pre-stream failure and returns its actual executor after a lost dispatch receipt', async () => {
        const f = delegatedFixture()
        const executions: XpertAgentExecutionUpsertCommand['execution'] = {}
        const execute = f.commands.execute.getMockImplementation()!
        f.commands.execute.mockImplementation(async (command) => {
            if (command instanceof XpertAgentExecutionUpsertCommand) Object.assign(executions, command.execution)
            return execute(command)
        })
        f.chat.mockRejectedValue(Error('worker startup rejected'))
        await f.service.startTask(f.input).catch(() => null)
        expect(executions).toMatchObject({
            xpertId: f.target.id,
            agentKey: 'executor',
            status: XpertAgentExecutionStatusEnum.ERROR,
            error: 'worker startup rejected'
        })
        const query = f.queries.execute.getMockImplementation()!
        f.queries.execute.mockImplementation(async (input) =>
            input instanceof XpertAgentExecutionOneQuery ? executions : query(input)
        )
        await expect(f.service.getTaskStatus({ executionId: executions.id })).resolves.toMatchObject({
            status: 'failed',
            executorXpertId: f.target.id,
            executorAgentKey: 'executor',
            errorMessage: 'worker startup rejected'
        })
        expect(publishedAgentDelegation()).toBeUndefined()
    })

    const source = {
        kind: 'provider_action' as const,
        operationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        leaseOwner: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        leaseFence: 1,
        callKey: 'primary'
    }
    it.each([false, true])(
        'authorizes the exact Pipeline native identity before creating a conversation (external=%s)',
        async (external) => {
            const f = fixture(external)
            const input = {
                ...f.input,
                projectId: 'project',
                executionId: 'native-execution',
                conversationId: 'conversation',
                pipelineSource: source
            }
            await f.service.startTask(input)
            expect(f.nativeAuthorize).toHaveBeenCalledWith({
                actor: { tenantId: 'tenant', organizationId: 'organization', userId: 'user' },
                projectId: 'project',
                source,
                executionId: 'native-execution',
                conversationId: 'conversation',
                xpertId: f.target.id,
                workspaceId: 'executor-workspace',
                publishedVersion: '1',
                inputDigest: expect.stringMatching(/^[a-f0-9]{64}$/)
            })
            expect(f.commands.execute.mock.calls[0][0]).toBeInstanceOf(AuthorizePipelineNativeExecutionCommand)
            await f.service.startTask(input)
            expect(f.nativeAuthorize).toHaveBeenCalledTimes(1)
            expect(
                f.commands.execute.mock.calls.filter(([command]) => command instanceof XpertChatCommand)
            ).toHaveLength(1)
        }
    )
    it('never creates native rows or dispatches a model when Pipeline authorization fails', async () => {
        const f = fixture(false)
        f.nativeAuthorize.mockRejectedValue(new Error('Denied by durable lease'))
        const result = await f.service
            .startTask({
                ...f.input,
                projectId: 'project',
                executionId: 'native-execution',
                conversationId: 'conversation',
                pipelineSource: source
            })
            .catch(() => null)
        expect(result?.status).not.toBe('running')
        expect(f.nativeAuthorize).toHaveBeenCalledTimes(1)
        expect(
            f.commands.execute.mock.calls.every(
                ([command]) => command instanceof AuthorizePipelineNativeExecutionCommand
            )
        ).toBe(true)
    })
    it('prepares a pinned input without dispatch and preserves its canonical digest across persisted key ordering', async () => {
        const f = fixture(true)
        const prepared = await f.service.preparePipelineTask({
            ...f.input,
            projectId: 'project',
            executionId: 'native-execution',
            conversationId: 'conversation',
            pipelineSource: source
        })
        expect(prepared.expectedPublishedVersion).toBe('1')
        expect(f.store.rows.size).toBe(0)
        expect(
            f.commands.execute.mock.calls.every(([command]) => command instanceof PreparePipelineNativeExecutionCommand)
        ).toBe(true)
        const reordered = Object.fromEntries(Object.entries(prepared).reverse()) as typeof prepared
        await f.service.startTask(reordered)
        expect(f.nativeAuthorize.mock.calls[0][0].inputDigest).toBe(f.nativePrepare.mock.calls[0][0].inputDigest)
    })

    it('rejects a stale pinned publication before creating an invocation or dispatching a task', async () => {
        const f = fixture(false)
        await expect(
            f.service.startTask({ ...f.input, expectedPublishedVersion: 'older-version' })
        ).rejects.toMatchObject({ code: 'CallConflict' })
        expect(f.store.rows.size).toBe(0)
        expect(f.commands.execute).not.toHaveBeenCalled()
    })

    it('authorizes only the exact published native role binding without exposing its instance ID', async () => {
        const f = fixture(true)
        const target = f.input.target!
        const input = {
            requesterXpertId: target.requesterXpertId,
            requesterAgentKey: target.requesterAgentKey,
            expectation: target.expectation,
            executorXpertId: f.target.id
        }
        const descriptor = await f.service.assertExternalAssistantBinding(input)
        expect(descriptor.primaryAgentKey).toBe('executor')
        expect(descriptor).not.toHaveProperty('xpertId')
        await expect(
            f.service.assertExternalAssistantBinding({ ...input, executorXpertId: 'unrelated-assistant' })
        ).rejects.toThrow('assistant_binding_executor_mismatch')
        f.target.publishAt = undefined
        await expect(f.service.assertExternalAssistantBinding(input)).rejects.toThrow('assistant_unpublished')
        expect(f.commands.execute).not.toHaveBeenCalled()
    })

    it.each([false, true])('persists an inspectable task from startTask (external=%s)', async (external) => {
        const f = fixture(external)
        await f.service.startTask(f.input)
        expect(f.store.rows.size).toBe(1)
        const [record] = f.store.rows.values()
        expect(record.invocation.scope.workspaceId).toBe('executor-workspace')
        await expect(f.reader.inspect(record.invocation)).resolves.toMatchObject({ status: 'running' })
        await f.service.startTask(f.input)
        expect(f.commands.execute.mock.calls.filter(([command]) => command instanceof XpertChatCommand)).toHaveLength(1)
        f.target.workspaceId = 'moved-workspace'
        await expect(f.reader.inspect(record.invocation)).rejects.toMatchObject({ code: 'InvalidScope' })
    })

    it.each<TChatConversationStatus | undefined>([undefined, 'idle', 'busy', 'paused'])(
        'uses real admission to claim idle threads and preserve active threads (status=%s)',
        async (status) => {
            const f = fixture(false)
            f.input.conversationId = 'conversation'
            const conversation = new ChatConversation({ id: 'conversation', threadId: 'thread', status })
            let thread = status
                ? new ChatConversationThread({
                      threadId: 'thread',
                      status,
                      ...(status === 'busy' || status === 'paused'
                          ? {
                                runControl: {
                                    executionId: 'existing-run',
                                    state: status === 'busy' ? 'running' : 'paused'
                                }
                            }
                          : {})
                  })
                : undefined
            const threadRepository = {
                createQueryBuilder: () => ({
                    insert: () => ({
                        values: (value: Partial<ChatConversationThread>) => ({
                            orIgnore: () => ({
                                execute: async () => {
                                    thread ??= new ChatConversationThread(value)
                                }
                            })
                        })
                    })
                }),
                findOne: async () => thread
            }
            const executionRepository = {
                createQueryBuilder: () => ({
                    insert: () => ({ values: () => ({ orIgnore: () => ({ execute: async () => undefined }) }) })
                })
            }
            const manager = {
                getRepository: (entity: unknown) =>
                    entity === ChatConversationThread ? threadRepository : executionRepository,
                save: jest.fn()
            }
            const module = await Test.createTestingModule({
                providers: [
                    ChatExecutionAdmissionService,
                    {
                        provide: DataSource,
                        useValue: {
                            getRepository: () => ({ findOneBy: async () => conversation }),
                            transaction: async (work: (value: typeof manager) => Promise<unknown>) => work(manager)
                        }
                    },
                    { provide: ThreadRunControlService, useValue: {} }
                ]
            }).compile()
            const admission = module.get(ChatExecutionAdmissionService)
            const graph = jest.fn(async () => NEVER)
            const original = f.commands.execute.getMockImplementation()!
            f.commands.execute.mockImplementation(async (command: unknown) => {
                if (command instanceof ChatConversationUpsertCommand) return Object.assign(conversation, command.entity)
                if (command instanceof XpertChatCommand) return admission.run(command.request, command.options, graph)
                return original(command)
            })
            try {
                if (status === 'busy' || status === 'paused') {
                    await expect(f.service.startTask(f.input)).rejects.toThrow()
                    expect(graph).not.toHaveBeenCalled()
                    expect(thread?.status).toBe(status)
                    expect(thread?.runControl?.executionId).toBe('existing-run')
                    expect(manager.save).not.toHaveBeenCalled()
                } else {
                    const receipt = await f.service.startTask(f.input)
                    expect(receipt.status).toBe('running')
                    expect(graph).toHaveBeenCalledTimes(1)
                    expect(thread?.runControl).toEqual({ executionId: receipt.executionId, state: 'running' })
                }
                expect(conversation.status).toBe(status)
            } finally {
                await module.close()
            }
        }
    )

    it('does not pre-mark the conversation busy', async () => {
        const f = fixture(false)
        await f.service.startTask(f.input)
        const upsert = f.commands.execute.mock.calls.find(
            ([command]) => command instanceof ChatConversationUpsertCommand
        )?.[0]
        expect(upsert).toBeInstanceOf(ChatConversationUpsertCommand)
        if (!(upsert instanceof ChatConversationUpsertCommand)) throw new Error('Missing conversation')
        expect(upsert.entity).not.toHaveProperty('status')
    })

    it('marks the reserved execution failed when admission rejects before subscription', async () => {
        const f = fixture(false)
        const admissionError = new Error('Admission conflict')
        const original = f.commands.execute.getMockImplementation()!
        f.commands.execute.mockImplementation(async (command: unknown) => {
            if (command instanceof XpertChatCommand) throw admissionError
            return original(command)
        })
        await expect(f.service.startTask(f.input)).rejects.toBe(admissionError)
        const updates = f.commands.execute.mock.calls
            .map(([command]) => command)
            .filter(
                (command): command is XpertAgentExecutionUpsertCommand =>
                    command instanceof XpertAgentExecutionUpsertCommand
            )
        expect(updates.at(-1)?.execution).toMatchObject({
            id: updates[0].execution.id,
            status: XpertAgentExecutionStatusEnum.ERROR
        })
        expect(updates).toHaveLength(2)
        expect(
            f.commands.execute.mock.calls.filter(([command]) => command instanceof ChatConversationUpsertCommand)
        ).toHaveLength(1)
    })

    it.each([null, undefined, '', '   '])(
        'normalizes absent database errors to the optional task receipt contract (%p)',
        async (error) => {
            const f = fixture(false)
            f.queries.execute.mockImplementation(async () => ({
                ...f.target,
                status: XpertAgentExecutionStatusEnum.SUCCESS,
                error,
                threadId: 'thread'
            }))
            const status = await f.service.getTaskStatus({ executionId: 'execution' })
            expect(status?.status).toBe('succeeded')
            expect(status?.errorMessage).toBeUndefined()
        }
    )

    it('uses the resumed attempt when inspecting or cancelling an original task handle', async () => {
        const f = fixture(false)
        f.taskControls.execution.mockResolvedValue({
            tenantId: 'tenant',
            organizationId: 'organization',
            currentExecutionId: 'resumed',
            threadId: 'same-thread'
        })
        f.queries.execute.mockImplementation(async (query) =>
            query instanceof XpertAgentExecutionOneQuery
                ? { ...f.target, id: query.id, threadId: 'same-thread', status: XpertAgentExecutionStatusEnum.RUNNING }
                : null
        )
        await expect(f.service.getTaskStatus({ executionId: 'original' })).resolves.toMatchObject({
            executionId: 'resumed',
            threadId: 'same-thread',
            status: 'running'
        })
        f.commands.execute.mockResolvedValue({ canceledExecutionIds: ['resumed'] })
        await f.service.cancelTask({ executionId: 'original' })
        expect(f.commands.execute).toHaveBeenCalledWith(
            expect.objectContaining({
                input: expect.objectContaining({ executionId: 'resumed', threadId: 'same-thread' })
            })
        )
    })

    it('does not resolve a task handle from another scope or thread', async () => {
        const f = fixture(false)
        f.taskControls.execution.mockResolvedValue({
            tenantId: 'other-tenant',
            organizationId: 'organization',
            currentExecutionId: 'resumed',
            threadId: 'same-thread'
        })
        await expect(f.service.getTaskStatus({ executionId: 'original' })).rejects.toMatchObject({
            code: 'InvalidScope'
        })
        f.taskControls.execution.mockResolvedValue({
            tenantId: 'tenant',
            organizationId: 'organization',
            currentExecutionId: 'resumed',
            threadId: 'same-thread'
        })
        await expect(
            f.service.cancelTask({ executionId: 'original', threadId: 'another-thread' })
        ).rejects.toMatchObject({ code: 'InvalidScope' })
        expect(f.queries.execute).not.toHaveBeenCalled()
        expect(f.commands.execute).not.toHaveBeenCalled()
    })
    it('rejects a workspace change between target resolution and dispatch authorization', async () => {
        const f = fixture(false)
        f.published.mockResolvedValueOnce(f.target).mockResolvedValue({ ...f.target, workspaceId: 'moved-workspace' })
        await expect(f.service.startTask(f.input)).rejects.toMatchObject({ cause: { code: 'CallConflict' } })
        expect(f.store.rows.size).toBe(0)
        expect(f.commands.execute).not.toHaveBeenCalled()
    })

    it('rejects a task without a resolved workspace before persistence or dispatch', async () => {
        const f = fixture(false)
        f.target.workspaceId = undefined
        await expect(f.service.startTask(f.input)).rejects.toMatchObject({ code: 'InvalidScope' })
        expect(f.store.rows.size).toBe(0)
        expect(f.commands.execute).not.toHaveBeenCalled()
    })
})

describe('Independent Assistant task storage lifetime', () => {
    it.each(['succeeded', 'failed'] as const)(
        'preserves context and reconciles %s after the dispatch lock is released',
        async (status) => {
            const root = await mkdtemp(path.join(tmpdir(), 'assistant-task-storage-'))
            const f = fixture(false)
            const scope = { tenantId: 'tenant', catalog: 'user-xperts' as const, userId: 'user', xpertId: f.target.id }
            let authorized = true
            const storage = new VolumeWorkspaceStorage(async () => {
                if (!authorized) throw new Error('access revoked')
                expect(RequestContext.currentTenantId()).toBe('tenant')
                expect(RequestContext.currentUserId()).toBe('user')
                expect(RequestContext.getOrganizationId()).toBe('organization')
                return new VolumeHandle(scope, path.join(root, 'workspace'), '', '', root)
            }, 'meetings')
            let resume: () => void = () => {}
            const gate = new Promise<void>((resolve) => {
                resume = resolve
            })
            let created: Promise<Buffer> = Promise.resolve(Buffer.alloc(0))
            let background: Promise<void> = Promise.resolve()
            let staleCaller: Promise<void> = Promise.resolve()
            const original = f.commands.execute.getMockImplementation()!
            let dispatched = 0
            const observation = jest.spyOn(f.service, 'getTaskStatus').mockImplementation(async (input) => ({
                status,
                control: {
                    version: 1,
                    source: 'platform',
                    subject: { kind: 'execution', id: input.executionId },
                    scope: 'owned_subtree',
                    state: 'settled',
                    desired: 'running',
                    taskId: input.executionId,
                    rootId: input.executionId,
                    revision: 1,
                    executionId: input.executionId,
                    threadId: 'thread',
                    observedAt: new Date().toISOString()
                }
            }))
            f.commands.execute.mockImplementation(async (command: unknown) => {
                if (!(command instanceof XpertChatCommand)) return original(command)
                dispatched++
                const context = RequestContext.currentRequestContext()
                expect(command.options.context).toEqual({ meetings: { operationId: 'operation-1' } })
                // Eager work starts during command execution, before subscribe is called.
                created = gate.then(() => storage.read('source'))
                return new Observable<MessageEvent>((subscriber) => {
                    background = gate.then(async () => {
                        expect(RequestContext.currentRequestContext()).toBe(context)
                        expect((await created).toString()).toBe('transcript')
                        expect((await storage.read('source')).toString()).toBe('transcript')
                        await storage.withLock('result', () => storage.write('summary', 'saved'))
                        authorized = false
                        await expect(storage.read('source')).rejects.toThrow('access revoked')
                        authorized = true
                        if (status === 'failed') subscriber.error(new Error('model failed'))
                        else subscriber.complete()
                    })
                })
            })
            try {
                await new Promise<void>((resolve, reject) =>
                    runWithRequestContext(
                        {
                            headers: { 'organization-id': 'organization', 'x-scope-level': 'organization' },
                            user: { id: 'user', tenantId: 'tenant' }
                        },
                        {},
                        () => {
                            void (async () => {
                                await storage.write('source', 'transcript')
                                const input = { ...f.input, context: { meetings: { operationId: 'operation-1' } } }
                                await storage.withLock('supervisor', async () => {
                                    const first = await f.service.startTask(input)
                                    const second = await f.service.startTask(input)
                                    expect(first.status).toBe('running')
                                    expect(second.executionId).toBe(first.executionId)
                                    staleCaller = gate.then(() => storage.write('source', 'stale'))
                                })
                                const staleRejected = expect(staleCaller).rejects.toMatchObject({ code: 'ELOCKLOST' })
                                resume()
                                await Promise.all([background, staleRejected])
                                expect(dispatched).toBe(1)
                                expect((await storage.read('summary')).toString()).toBe('saved')
                                // Completion observation is asynchronous and updates the invocation checkpoint.
                                for (
                                    let i = 0;
                                    i < 20 && [...f.store.rows.values()][0].invocation.status !== status;
                                    i++
                                )
                                    await new Promise<void>((done) => setImmediate(done))
                                expect([...f.store.rows.values()][0].invocation.status).toBe(status)
                                expect(observation).toHaveBeenCalled()
                            })().then(resolve, reject)
                        }
                    )
                )
            } finally {
                resume()
                jest.restoreAllMocks()
                await rm(root, { recursive: true, force: true })
            }
        }
    )
})
