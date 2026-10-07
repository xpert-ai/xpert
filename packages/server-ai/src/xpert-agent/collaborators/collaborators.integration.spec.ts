jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
// Reference loading has its own tests; this fixture exercises native delegation and resume.
jest.mock('../../xpert-middleware/thread-reference.runtime', () => ({
    createThreadReferenceMiddleware: jest.fn(async () => ({
        key: '__thread_reference_middleware__',
        middleware: { name: 'ThreadReferenceMiddleware' }
    }))
}))

import { AIMessage, BaseMessage, HumanMessage, isToolMessage } from '@langchain/core/messages'
import { RunnableConfig, RunnableLambda } from '@langchain/core/runnables'
import { Command, END, interrupt, MemorySaver, START, StateGraph } from '@langchain/langgraph'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { Logger } from '@nestjs/common'
import {
    channelName,
    ChatMessageEventTypeEnum,
    IEnvironment,
    IXpert,
    IXpertAgent,
    IXpertAgentExecution,
    STATE_VARIABLE_HUMAN,
    STATE_VARIABLE_SYS,
    TXpertGraph,
    XpertParameterTypeEnum
} from '@xpert-ai/contracts'
import { Subscriber } from 'rxjs'
import { emptyRuntimeResources, RuntimeResourceService } from '../../agent-plugin/runtime-resource.service'
import { CopilotCheckpointSaver } from '../../copilot-checkpoint'
import { AgentStateAnnotation, STATE_VARIABLE_PENDING_FOLLOW_UPS } from '../../shared/agent/state'
import { AgentMiddlewareRuntimeService } from '../../shared/agent/middleware-runtime'
import { XpertAgentExecutionUpsertCommand } from '../../xpert-agent-execution/commands'
import { XpertAgentExecutionOneQuery } from '../../xpert-agent-execution/queries'
import { GetXpertWorkflowQuery, GetXpertChatModelQuery } from '../../xpert/queries'
import { ToolsetGetToolsCommand } from '../../xpert-toolset'
import { XpertAgentSubgraphHandler } from '../commands/handlers/subgraph.handler'
import { XpertAgentSubgraphCommand } from '../commands/subgraph.command'
import { CreateNodeStagePendingSteerFollowUpsCommand } from '../commands/create-node-stage-pending-steer-follow-ups.command'
import { CreateNodeConsumePendingSteerFollowUpsCommand } from '../commands/create-node-consume-pending-steer-follow-ups.command'
import { AgentInvocationGraphService } from '../../agent-invocation/agent-invocation-graph.service'
import { AgentInvocationRuntime } from '../../agent-invocation/invocation-runtime'
import { NativeAgentCompiler } from '../../agent-invocation/native-agent.compiler'
import { NativeAgentRuntimeStrategy } from '../../agent-invocation/native-agent.strategy'
import { MemoryInvocationStore } from '../../agent-invocation/invocation-test-store'
import { AgentRuntimeRegistry, BUILTIN_GLOBAL_SCOPE, RequestContext } from '@xpert-ai/plugin-sdk'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { ExecutionCancelService } from '../../shared/execution/execution-cancel.service'
import type { RedisClientType } from 'redis'
import { THREAD_REFERENCE_MIDDLEWARE_NAME } from '../../xpert-middleware/thread-reference.middleware'

function fixture(
    settings: {
        dynamic?: boolean
        interruptBefore?: boolean
        interruptInside?: boolean
        endNode?: boolean
        parallel?: boolean
        onChild?: (config: RunnableConfig) => Promise<void>
    } = {}
) {
    const expert = {
        id: 'expert-1',
        slug: 'review_case',
        title: 'Case reviewer',
        description: 'Review a case',
        publishAt: new Date('2026-01-01'),
        agent: { key: 'reviewer', parameters: [{ name: 'caseId', type: XpertParameterTypeEnum.STRING }] },
        agentConfig: { mute: [['private-step']] }
    } as IXpert
    const team = {
        id: 'parent',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        workspaceId: 'workspace-1',
        agentConfig: {
            interruptBefore: settings.interruptBefore ? [expert.slug] : [],
            endNodes: settings.endNode ? [expert.slug] : []
        },
        copilotModel: {
            model: 'test-model',
            copilot: { modelProvider: { providerName: 'test' }, copilotModel: { model: 'test-model' } }
        }
    } as IXpert
    const agent = {
        key: 'leader',
        name: 'Leader',
        prompt: 'Ask the reviewer to review the case.',
        team,
        options: { fileUnderstanding: { enabled: false }, parallelToolCalls: settings.parallel },
        collaborators: settings.dynamic ? [] : [expert],
        toolsetIds: [],
        knowledgebaseIds: []
    } as IXpertAgent
    const definition: TXpertGraph = {
        nodes: [{ key: agent.key, type: 'agent', entity: agent, position: { x: 0, y: 0 } }],
        connections: []
    }
    const resources = {
        ...emptyRuntimeResources(),
        experts: [expert],
        selection: {
            revision: 1,
            resources: [{ bindingId: 'binding-1', version: 'version-1' }]
        }
    }
    const executions = new Map<string, Partial<IXpertAgentExecution>>()
    const childInvocations: Array<{ state: typeof AgentStateAnnotation.State; config: RunnableConfig }> = []
    const childStep = RunnableLambda.from(async (state: typeof AgentStateAnnotation.State, config) => {
        if (settings.interruptInside) interrupt('Approve the review')
        childInvocations.push({ state, config })
        await settings.onChild?.(config)
        return { messages: [new AIMessage('Reviewed case-1')] }
    })
    const childGraph = settings.interruptInside
        ? new StateGraph(AgentStateAnnotation)
              .addNode('review', childStep)
              .addEdge(START, 'review')
              .addEdge('review', END)
              .compile({ checkpointer: true })
        : childStep
    const childCommands: XpertAgentSubgraphCommand[] = []
    const commandBus = {
        execute: jest.fn(async (command: unknown) => {
            if (command instanceof ToolsetGetToolsCommand) return []
            if (command instanceof CreateNodeStagePendingSteerFollowUpsCommand)
                return RunnableLambda.from(() => ({ [STATE_VARIABLE_PENDING_FOLLOW_UPS]: [] }))
            if (command instanceof CreateNodeConsumePendingSteerFollowUpsCommand) return RunnableLambda.from(() => ({}))
            if (command instanceof XpertAgentSubgraphCommand) {
                childCommands.push(command)
                return { graph: childGraph, nextNodes: [], failNode: undefined }
            }
            if (command instanceof XpertAgentExecutionUpsertCommand) {
                const execution = { ...command.execution, id: command.execution.id ?? `child-${executions.size + 1}` }
                executions.set(execution.id, execution)
                return execution
            }
            throw new Error(`Unexpected command ${command?.constructor.name}`)
        })
    }
    const modelInvoke = jest.fn(async (messages: BaseMessage[]) => {
        return messages.some(isToolMessage)
            ? new AIMessage('The reviewer finished.')
            : new AIMessage({
                  content: '',
                  tool_calls: [
                      {
                          id: 'call-1',
                          name: expert.slug,
                          args: { input: 'Review case-1', caseId: 'case-1' }
                      },
                      ...(settings.parallel
                          ? [{ id: 'call-2', name: expert.slug, args: { input: 'Review case-2', caseId: 'case-2' } }]
                          : [])
                  ]
              })
    })
    const model = Object.assign(RunnableLambda.from(modelInvoke), { bindTools: jest.fn() })
    model.bindTools.mockReturnValue(model)
    const queryBus = {
        execute: jest.fn(async (query: unknown) => {
            if (query instanceof GetXpertWorkflowQuery)
                return query.id === 'parent'
                    ? { agent, graph: definition, next: [], fail: [] }
                    : { agent: expert.agent, graph: { nodes: [], connections: [] } }
            if (query instanceof GetXpertChatModelQuery) return model
            if (query instanceof XpertAgentExecutionOneQuery) return executions.get(query.id)
            throw new Error(`Unexpected query ${query?.constructor.name}`)
        })
    }
    const resourceService = { resolve: jest.fn().mockResolvedValue(resources) }
    jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
    const registry = new AgentRuntimeRegistry({} as DiscoveryService, new Reflector())
    registry.register('xpert', new NativeAgentRuntimeStrategy(), { kind: 'builtin', scopeKey: BUILTIN_GLOBAL_SCOPE })
    const store = new MemoryInvocationStore()
    const invocations = new AgentInvocationRuntime(store, registry)
    const cancellations = new ExecutionCancelService({
        publish: jest.fn().mockResolvedValue(1)
    } as unknown as RedisClientType)
    const runtime = new AgentInvocationGraphService(
        commandBus as unknown as CommandBus,
        queryBus as unknown as QueryBus,
        resourceService as unknown as RuntimeResourceService,
        invocations,
        new NativeAgentCompiler(commandBus as unknown as CommandBus, queryBus as unknown as QueryBus),
        cancellations
    )
    const middlewareRuntime = {
        createScopedApi: jest.fn().mockReturnValue({}),
        resolveSelectedConnectorRuntimeBindings: jest.fn().mockResolvedValue([])
    }
    const handler = new XpertAgentSubgraphHandler(
        new MemorySaver() as unknown as CopilotCheckpointSaver,
        commandBus as unknown as CommandBus,
        queryBus as unknown as QueryBus,
        { t: jest.fn(), translate: jest.fn() } as never,
        null,
        middlewareRuntime as unknown as AgentMiddlewareRuntimeService,
        { findOne: jest.fn(async (id: string) => ({ id })) } as never
    )
    Object.defineProperties(handler, {
        invocationGraph: { value: runtime },
        runtimeResourceService: { value: resourceService },
        // The graph now always constructs this gate; these fixtures have no thread references.
        agentMiddlewareRegistry: {
            value: {
                get: jest.fn((name: string) =>
                    name === THREAD_REFERENCE_MIDDLEWARE_NAME
                        ? { createMiddleware: async () => ({ name: THREAD_REFERENCE_MIDDLEWARE_NAME }) }
                        : undefined
                )
            }
        }
    })
    const events: MessageEvent[] = []
    const controller = new AbortController()
    const command = new XpertAgentSubgraphCommand(agent.key, team, {
        isStart: true,
        isDraft: false,
        mute: [],
        unmutes: [],
        store: null,
        subscriber: new Subscriber<MessageEvent>({
            next: (event) => {
                events.push(event)
            },
            error: () => undefined,
            complete: () => undefined
        }),
        execution: { id: 'parent-run' },
        rootController: controller,
        signal: controller.signal,
        channel: channelName(agent.key),
        thread_id: 'thread-1',
        projectId: 'project-1',
        environment: { variables: [] } as IEnvironment,
        partners: ['active-partner'],
        ...(settings.dynamic ? { runtimeResources: resources } : {})
    })
    const input = {
        input: 'Review case-1',
        [STATE_VARIABLE_HUMAN]: { input: 'Review case-1' },
        messages: [new HumanMessage('Review case-1')],
        [STATE_VARIABLE_SYS]: {
            language: 'en-US',
            user_email: '',
            timezone: 'UTC',
            date: '2026-01-01',
            datetime: '2026-01-01 10:00:00',
            common_times: ''
        },
        [channelName(agent.key)]: { messages: [new HumanMessage('Review case-1')] }
    }
    const config = {
        configurable: {
            thread_id: 'thread-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'user-1',
            agentKey: agent.key,
            executionId: 'parent-run',
            xpertId: team.id
        },
        recursionLimit: 30
    }
    return {
        handler,
        command,
        config,
        input,
        expert,
        resources,
        resourceService,
        model,
        modelInvoke,
        childCommands,
        childInvocations,
        executions,
        events,
        definition,
        controller,
        agent,
        queryBus,
        cancellations,
        store
    }
}

describe('Collaborators middleware in the Agent graph', () => {
    beforeEach(() => {
        jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined)
        jest.spyOn(Logger.prototype, 'verbose').mockImplementation(() => undefined)
    })
    afterEach(() => jest.restoreAllMocks())

    it.each([false, true])('executes %s dynamic experts and returns a tool result to the parent', async (dynamic) => {
        const f = fixture({ dynamic })
        const original = JSON.stringify(f.definition)
        const { graph } = await f.handler.execute(f.command)
        const output = await graph.invoke(f.input, f.config)
        expect(f.childInvocations).toHaveLength(1)
        expect(f.modelInvoke).toHaveBeenCalledTimes(2)
        expect(f.childInvocations[0].state[STATE_VARIABLE_HUMAN]).toMatchObject({
            input: 'Review case-1',
            caseId: 'case-1'
        })
        expect(output.messages).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    content: 'Reviewed case-1',
                    name: 'review_case',
                    tool_call_id: 'call-1'
                })
            ])
        )
        expect([...f.executions.values()][0]).toMatchObject({
            parentId: 'parent-run',
            agentKey: 'reviewer',
            metadata: { invocationKind: 'external_assistant', sourceToolCallId: 'call-1', requesterXpertId: 'parent' }
        })
        expect(f.events.length).toBeGreaterThanOrEqual(2)
        for (const event of [ChatMessageEventTypeEnum.ON_AGENT_START, ChatMessageEventTypeEnum.ON_AGENT_END]) {
            expect(f.events).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        data: expect.objectContaining({
                            event,
                            data: expect.objectContaining({
                                parentId: 'parent-run',
                                metadata: expect.objectContaining({ sourceToolCallId: 'call-1' })
                            })
                        })
                    })
                ])
            )
        }
        expect(f.command.options.mute).toContainEqual(['expert-1', 'private-step'])
        expect(f.childCommands[0].options).toMatchObject({
            leaderKey: 'leader',
            isStart: true,
            isDraft: false,
            thread_id: 'thread-1',
            partners: ['active-partner']
        })
        expect(f.childCommands[0].options.rootController).not.toBe(f.controller)
        expect(f.childCommands[0].options.signal).toBe(f.childInvocations[0].config.signal)
        expect(f.childCommands[0].options.runtimeResources).toBeUndefined()
        expect(f.childInvocations[0].config.recursionLimit).toBeGreaterThan(0)
        expect(f.childInvocations[0].config.configurable.xpertId).toBe(f.expert.id)
        expect(f.childInvocations[0].config.recursionLimit).toBeLessThanOrEqual(f.config.recursionLimit)
        expect(JSON.stringify(f.definition)).toBe(original)
        if (dynamic)
            expect(f.resourceService.resolve).toHaveBeenCalledWith('parent', f.resources.selection, 'project-1')
    })

    it('returns a cancelled expert as a tool error while its parallel sibling and parent finish normally', async () => {
        let started!: () => void
        const ready = new Promise<void>((resolve) => {
            started = resolve
        })
        const release = new Map<string, () => void>()
        const signals = new Map<string, AbortSignal>()
        const f = fixture({
            parallel: true,
            onChild: (config) =>
                new Promise<void>((resolve, reject) => {
                    const id = config.configurable.executionId as string
                    signals.set(id, config.signal)
                    release.set(id, resolve)
                    config.signal.addEventListener('abort', () => reject(new Error('Provider aborted')), { once: true })
                    if (signals.size === 2) started()
                })
        })
        const { graph } = await f.handler.execute(f.command)
        const running = graph.invoke(f.input, f.config)
        await ready
        const [cancelledId, siblingId] = [...signals.keys()]
        await f.cancellations.cancelExecutions([cancelledId], '已被用户取消，请勿自动重试')
        expect(signals.get(cancelledId).aborted).toBe(true)
        expect(signals.get(siblingId).aborted).toBe(false)
        expect(f.controller.signal.aborted).toBe(false)
        release.get(siblingId)()
        const output = await running
        expect(output.messages).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    status: 'error',
                    content: 'EXECUTION_CANCELLED_BY_USER: 已被用户取消，请勿自动重试'
                })
            ])
        )
        expect(f.executions.get(cancelledId)).toMatchObject({
            status: 'interrupted',
            error: '已被用户取消，请勿自动重试'
        })
        expect(f.executions.get(siblingId)).toMatchObject({ status: 'success' })
        expect(f.store.rows.get(cancelledId).invocation.status).toBe('cancelled')
        expect(f.modelInvoke).toHaveBeenCalledTimes(2)
        expect(f.childInvocations).toHaveLength(2)
        expect(f.childCommands[0].options.rootController).not.toBe(f.childCommands[1].options.rootController)
        expect(f.events).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    data: expect.objectContaining({
                        event: ChatMessageEventTypeEnum.ON_AGENT_END,
                        data: expect.objectContaining({ id: cancelledId, status: 'interrupted' })
                    })
                })
            ])
        )
    })

    it('preserves endNodes routing without invoking the parent model again', async () => {
        const f = fixture({ endNode: true })
        const { graph } = await f.handler.execute(f.command)
        await graph.invoke(f.input, f.config)
        expect(f.childInvocations).toHaveLength(1)
        expect(f.modelInvoke).toHaveBeenCalledTimes(1)
    })

    it('resumes the same expert node with its frozen resource selection', async () => {
        const f = fixture({ dynamic: true, interruptBefore: true })
        const selection = structuredClone(f.resources.selection)
        const { graph } = await f.handler.execute(f.command)
        await graph.invoke(f.input, f.config)
        expect((await graph.getState(f.config)).next).toContain('review_case')
        expect(f.childInvocations).toHaveLength(0)
        f.resources.selection.resources[0].version = 'next-run-version'
        await graph.invoke(null, f.config)
        expect(f.childInvocations).toHaveLength(1)
        expect(f.resourceService.resolve).toHaveBeenCalledWith('parent', selection, 'project-1')
        expect(f.modelInvoke).toHaveBeenCalledTimes(2)
    })

    it.each(['permission revoked', 'published version changed'])('blocks a paused child when %s', async (reason) => {
        const f = fixture({ dynamic: true, interruptBefore: true })
        const { graph } = await f.handler.execute(f.command)
        await graph.invoke(f.input, f.config)
        f.resourceService.resolve.mockRejectedValue(new Error(reason))
        await expect(graph.invoke(null, f.config)).rejects.toThrow(reason)
        expect(f.childInvocations).toHaveLength(0)
        expect(f.executions.size).toBe(0)
    })

    it('resumes an interrupt inside the expert graph and returns to the parent', async () => {
        const f = fixture({ dynamic: true, interruptInside: true })
        const { graph } = await f.handler.execute(f.command)
        await graph.invoke(f.input, f.config)
        expect(f.childInvocations).toHaveLength(0)
        expect((await graph.getState(f.config)).next).toContain('review_case')
        await graph.invoke(new Command({ resume: 'approved' }), f.config)
        expect(f.childInvocations).toHaveLength(1)
        expect(f.modelInvoke).toHaveBeenCalledTimes(2)
        expect(f.resourceService.resolve).toHaveBeenCalledTimes(4)
    })

    it('resumes a recompiled published expert after its unpublished draft changes', async () => {
        const f = fixture({ dynamic: true, interruptInside: true })
        f.expert.draft = { team: { name: 'Draft one' }, nodes: [], connections: [] }
        const { graph } = await f.handler.execute(f.command)
        await graph.invoke(f.input, f.config)
        expect(f.childInvocations).toHaveLength(0)
        f.expert.draft.team.name = 'Draft two'
        const recompiled = await f.handler.execute(f.command)
        await recompiled.graph.invoke(new Command({ resume: 'approved' }), f.config)
        expect(f.childInvocations).toHaveLength(1)
        expect(f.modelInvoke).toHaveBeenCalledTimes(2)
    })

    it('rejects resume when recompilation uses a different published version', async () => {
        const f = fixture({ dynamic: true, interruptInside: true })
        const { graph } = await f.handler.execute(f.command)
        await graph.invoke(f.input, f.config)
        f.expert.publishAt = new Date('2026-02-01')
        const recompiled = await f.handler.execute(f.command)
        await expect(recompiled.graph.invoke(new Command({ resume: 'approved' }), f.config)).rejects.toThrow()
        expect(f.childInvocations).toHaveLength(0)
    })

    it('rejects conflicting expert names before either child is compiled', async () => {
        const f = fixture()
        f.agent.collaborators.push({ ...f.expert, id: 'expert-2' })
        await expect(f.handler.execute(f.command)).rejects.toThrow()
        expect(f.childCommands).toHaveLength(0)
    })

    it('rechecks configured expert access on resume without replacing the compiled graph', async () => {
        const f = fixture({ interruptBefore: true })
        const { graph } = await f.handler.execute(f.command)
        await graph.invoke(f.input, f.config)
        f.queryBus.execute.mockRejectedValueOnce(new Error('Configured expert access revoked'))
        await expect(graph.invoke(null, f.config)).rejects.toThrow('Configured expert access revoked')
        expect(f.childInvocations).toHaveLength(0)
    })

    it('propagates cancellation without starting the expert', async () => {
        const f = fixture({ dynamic: true, interruptBefore: true })
        const { graph } = await f.handler.execute(f.command)
        await graph.invoke(f.input, f.config)
        f.controller.abort()
        await expect(graph.invoke(null, { ...f.config, signal: f.controller.signal })).rejects.toThrow()
        expect(f.childInvocations).toHaveLength(0)
    })
})
