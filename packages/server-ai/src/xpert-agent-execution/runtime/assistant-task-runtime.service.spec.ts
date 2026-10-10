jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))

import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { DiscoveryService, ModuleRef, Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { IXpert, XpertTypeEnum, XpertAgentExecutionStatusEnum, TChatConversationStatus } from '@xpert-ai/contracts'
import {
    AgentMiddlewareAssistantTaskInput,
    AgentRuntimeRegistry,
    BUILTIN_GLOBAL_SCOPE,
    DefaultRuntimeCapabilityRegistry,
    RequestContext
} from '@xpert-ai/plugin-sdk'
import { NEVER } from 'rxjs'
import { DataSource } from 'typeorm'
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
import { AssistantTaskRuntimeService } from './assistant-task-runtime.service'

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
        execute: jest.fn(async (query: unknown) => {
            if (query instanceof FindXpertQuery) return query.conditions.id === callerId ? caller : target
            if (query instanceof GetXpertWorkflowQuery) {
                const xpert = query.id === callerId ? caller : target
                return { agent: { ...xpert.agent, team: xpert }, graph: xpert.graph }
            }
            throw new Error(`Unexpected query: ${query?.constructor.name}`)
        })
    }
    const commands = {
        execute: jest.fn(async (command: unknown) => {
            if (command instanceof ChatConversationUpsertCommand) return { ...command.entity, threadId: 'thread' }
            if (command instanceof XpertAgentExecutionUpsertCommand) return command.execution
            if (command instanceof XpertChatCommand) return NEVER
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
    const published = jest.fn(async () => target)
    const dependencies = new Map<unknown, unknown>([
        [AgentInvocationRuntime, runtime],
        [PublishedXpertAccessService, { getAccessiblePublishedXpert: published }]
    ])
    const service = new AssistantTaskRuntimeService(
        commands as unknown as CommandBus,
        queries as unknown as QueryBus,
        { get: (token: unknown) => dependencies.get(token) } as ModuleRef
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
    return { service, reader, store, target, input, commands, queries, published }
}

describe('Assistant Task workspace scope', () => {
    beforeEach(() => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('organization')
    })
    afterEach(() => jest.restoreAllMocks())

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
