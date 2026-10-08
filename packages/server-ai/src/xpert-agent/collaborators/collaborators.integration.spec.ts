jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
// Reference loading has its own tests; this fixture exercises native delegation and resume.
jest.mock('../../xpert-middleware/thread-reference.runtime', () => ({
    createThreadReferenceMiddleware: jest.fn(async () => ({
        key: '__thread_reference_middleware__',
        middleware: { name: 'ThreadReferenceMiddleware' }
    }))
}))

import { AIMessage, BaseMessage, HumanMessage, ToolMessage, isToolMessage } from '@langchain/core/messages'
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
    XpertParameterTypeEnum,
    type TAgentExecutionOutcome
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
import { PARALLEL_DELEGATION_TOOL } from '../../agent-invocation/parallel-delegation'
import { createThreadReferenceMiddleware } from '../../xpert-middleware/thread-reference.runtime'
import type { WrapToolCallHook } from '@xpert-ai/plugin-sdk'

function fixture(
    settings: {
        outcome?: TAgentExecutionOutcome
        dynamic?: boolean
        interruptBefore?: boolean
        interruptInside?: boolean
        interruptCase?: string
        endNode?: boolean
        parallel?: boolean
        batch?: boolean
        batchSize?: number
        guard?: WrapToolCallHook
        onChild?: (config: RunnableConfig) => Promise<void>
    } = {}
) {
    if (settings.guard)
        jest.mocked(createThreadReferenceMiddleware).mockResolvedValueOnce({
            key: '__thread_reference_middleware__',
            middleware: { name: 'TestGuard', wrapToolCall: settings.guard }
        })
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
        options: { fileUnderstanding: { enabled: false }, parallelToolCalls: settings.parallel || settings.batch },
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
        if (
            settings.interruptInside &&
            (!settings.interruptCase || state[STATE_VARIABLE_HUMAN]?.caseId === settings.interruptCase)
        )
            interrupt('Approve the review')
        childInvocations.push({ state, config })
        await settings.onChild?.(config)
        return {
            messages: [
                ...(settings.outcome
                    ? [
                          new ToolMessage({
                              content: JSON.stringify(settings.outcome),
                              tool_call_id: 'claim-call',
                              artifact: {
                                  type: 'agent_execution_outcome',
                                  executionId: config.configurable.executionId,
                                  outcome: settings.outcome
                              }
                          })
                      ]
                    : []),
                new AIMessage('Reviewed case-1')
            ]
        }
    })
    const childGraph = settings.interruptInside
        ? new StateGraph(AgentStateAnnotation)
              .addNode('review', childStep)
              .addEdge(START, 'review')
              .addEdge('review', END)
              // Like the host compiler, retain invocation namespaces and inherit its saver.
              .compile()
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
                  tool_calls: settings.batch
                      ? [
                            {
                                id: 'batch-call',
                                name: PARALLEL_DELEGATION_TOOL,
                                args: {
                                    tasks: Array.from({ length: settings.batchSize ?? 2 }, (_, index) => ({
                                        assistant: expert.slug,
                                        arguments: { input: `Review case-${index + 1}`, caseId: `case-${index + 1}` }
                                    }))
                                }
                            }
                        ]
                      : [
                            {
                                id: 'call-1',
                                name: expert.slug,
                                args: { input: 'Review case-1', caseId: 'case-1' }
                            },
                            ...(settings.parallel
                                ? [
                                      {
                                          id: 'call-2',
                                          name: expert.slug,
                                          args: { input: 'Review case-2', caseId: 'case-2' }
                                      }
                                  ]
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

    it('preserves domain outcomes in the parent reply, persisted metadata and live end event', async () => {
        const outcome: TAgentExecutionOutcome = {
            status: 'already_completed',
            subjectId: 'task-1',
            accepted: true,
            versionId: 'version-1'
        }
        const f = fixture({ outcome })
        const { graph } = await f.handler.execute(f.command)
        const output = await graph.invoke(f.input, f.config)
        const reply = output.messages.find((message) => isToolMessage(message) && message.name === 'review_case')
        expect(JSON.parse(String(reply.content))).toEqual({
            businessOutcome: outcome,
            assistantMessage: 'Reviewed case-1'
        })
        expect([...f.executions.values()][0]).toMatchObject({
            status: 'success',
            metadata: { businessOutcome: outcome }
        })
        expect(f.events).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    data: expect.objectContaining({
                        event: ChatMessageEventTypeEnum.ON_AGENT_END,
                        data: expect.objectContaining({
                            metadata: expect.objectContaining({ businessOutcome: outcome })
                        })
                    })
                })
            ])
        )
    })

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

    it.each([false, true])(
        'isolates a cancelled expert from its parallel sibling and parent (batch=%s)',
        async (batch) => {
            let started!: () => void
            const ready = new Promise<void>((resolve) => {
                started = resolve
            })
            const release = new Map<string, () => void>()
            const signals = new Map<string, AbortSignal>()
            const f = fixture({
                parallel: true,
                batch,
                onChild: (config) =>
                    new Promise<void>((resolve, reject) => {
                        const id = config.configurable.executionId as string
                        signals.set(id, config.signal)
                        release.set(id, resolve)
                        config.signal.addEventListener('abort', () => reject(new Error('Provider aborted')), {
                            once: true
                        })
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
            if (batch) {
                const reply = output.messages.find(
                    (message) => isToolMessage(message) && message.name === PARALLEL_DELEGATION_TOOL
                )
                expect(
                    JSON.parse(String(reply.content))
                        .results.map((item) => item.status)
                        .sort()
                ).toEqual(['cancelled', 'completed'])
                expect(f.childInvocations.map(({ state }) => state[STATE_VARIABLE_HUMAN])).toEqual([
                    { input: 'Review case-1', caseId: 'case-1' },
                    { input: 'Review case-2', caseId: 'case-2' }
                ])
                expect(new Set(f.childInvocations.map(({ config }) => config.configurable.checkpoint_ns)).size).toBe(2)
            } else
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
        }
    )

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

    it('resumes independent children of a single delegation call without mixing their checkpoints', async () => {
        const f = fixture({ batch: true, dynamic: true, interruptInside: true })
        const { graph } = await f.handler.execute(f.command)
        await graph.invoke(f.input, f.config)
        expect(f.childInvocations).toHaveLength(0)
        expect((await graph.getState(f.config)).next).toContain(PARALLEL_DELEGATION_TOOL)
        // The first scalar resume handles one interrupt; the other remains independently suspended.
        await graph.invoke(new Command({ resume: 'approved' }), f.config)
        if ((await graph.getState(f.config)).next.length)
            await graph.invoke(new Command({ resume: 'approved' }), f.config)
        expect(f.childInvocations).toHaveLength(2)
        expect(new Set(f.childInvocations.map(({ config }) => config.configurable.executionId)).size).toBe(2)
        expect(f.childInvocations.map(({ state }) => state[STATE_VARIABLE_HUMAN].caseId).sort()).toEqual([
            'case-1',
            'case-2'
        ])
        expect(f.modelInvoke).toHaveBeenCalledTimes(2)
    })

    it('does not repeat a completed sibling when a recompiled collection resumes its paused task', async () => {
        const f = fixture({ batch: true, interruptInside: true, interruptCase: 'case-2' })
        const { graph } = await f.handler.execute(f.command)
        await graph.invoke(f.input, f.config)
        expect(f.childInvocations).toHaveLength(1)
        const firstId = f.childInvocations[0].config.configurable.executionId
        const rebuilt = await f.handler.execute(f.command)
        const output = await rebuilt.graph.invoke(new Command({ resume: 'approved' }), f.config)
        expect(f.childInvocations).toHaveLength(2)
        expect(f.childInvocations.filter(({ config }) => config.configurable.executionId === firstId)).toHaveLength(1)
        const reply = output.messages.find(
            (message) => isToolMessage(message) && message.name === PARALLEL_DELEGATION_TOOL
        )
        expect(JSON.parse(String(reply.content)).results.map((item) => item.index)).toEqual([0, 1])
    })

    it('starts all seven selected chapter equivalents before any one finishes', async () => {
        let started!: () => void
        const ready = new Promise<void>((resolve) => {
            started = resolve
        })
        const releases: Array<() => void> = []
        const f = fixture({
            batch: true,
            batchSize: 7,
            onChild: () =>
                new Promise<void>((resolve) => {
                    releases.push(resolve)
                    if (releases.length === 7) started()
                })
        })
        const { graph } = await f.handler.execute(f.command)
        const running = graph.invoke(f.input, f.config)
        await ready
        expect(f.childInvocations).toHaveLength(7)
        expect(new Set(f.childInvocations.map(({ config }) => config.configurable.executionId)).size).toBe(7)
        expect(f.modelInvoke).toHaveBeenCalledTimes(1)
        releases.forEach((release) => release())
        const output = await running
        const reply = output.messages.find(
            (message) => isToolMessage(message) && message.name === PARALLEL_DELEGATION_TOOL
        )
        expect(JSON.parse(String(reply.content)).results).toHaveLength(7)
        expect(f.modelInvoke).toHaveBeenCalledTimes(2)
    })

    it('aborts all active children when the parent is cancelled', async () => {
        let started!: () => void
        const ready = new Promise<void>((resolve) => {
            started = resolve
        })
        const signals: AbortSignal[] = []
        const f = fixture({
            batch: true,
            onChild: (config) =>
                new Promise<void>((_resolve, reject) => {
                    signals.push(config.signal)
                    config.signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true })
                    if (signals.length === 2) started()
                })
        })
        const { graph } = await f.handler.execute(f.command)
        const running = graph.invoke(f.input, { ...f.config, signal: f.controller.signal })
        const assertion = expect(running).rejects.toThrow()
        await ready
        f.controller.abort()
        await assertion
        expect(signals.every((signal) => signal.aborted)).toBe(true)
    })

    it('applies the normal per-assistant middleware guard to collection items', async () => {
        const f = fixture({
            batch: true,
            guard: async (request, handler) => {
                if (request.toolCall.name === 'review_case' && request.toolCall.args.caseId === 'case-2')
                    throw new Error('Task outside the granted scope')
                return handler(request)
            }
        })
        const { graph } = await f.handler.execute(f.command)
        const output = await graph.invoke(f.input, f.config)
        expect(f.childInvocations).toHaveLength(1)
        const reply = output.messages.find(
            (message) => isToolMessage(message) && message.name === PARALLEL_DELEGATION_TOOL
        )
        expect(JSON.parse(String(reply.content)).results).toMatchObject([
            { index: 0, status: 'completed' },
            { index: 1, status: 'failed', error: 'Task outside the granted scope' }
        ])
    })

    it('accepts distinct parameter schemas for different authorized Assistants in one call', async () => {
        const f = fixture({ batch: true })
        const second = {
            ...f.expert,
            id: 'expert-2',
            slug: 'audit_report',
            agent: { key: 'auditor', parameters: [{ name: 'reportId', type: XpertParameterTypeEnum.STRING }] }
        } as IXpert
        f.agent.collaborators.push(second)
        const execute = f.queryBus.execute.getMockImplementation()
        f.queryBus.execute.mockImplementation(async (query) =>
            query instanceof GetXpertWorkflowQuery && query.id === second.id
                ? { agent: second.agent, graph: { nodes: [], connections: [] } }
                : execute(query)
        )
        f.modelInvoke.mockResolvedValueOnce(
            new AIMessage({
                content: '',
                tool_calls: [
                    {
                        id: 'mixed',
                        name: PARALLEL_DELEGATION_TOOL,
                        args: {
                            tasks: [
                                { assistant: f.expert.slug, arguments: { input: 'Review', caseId: 'case-1' } },
                                { assistant: second.slug, arguments: { input: 'Audit', reportId: 'report-1' } }
                            ]
                        }
                    }
                ]
            })
        )
        const { graph } = await f.handler.execute(f.command)
        const output = await graph.invoke(f.input, f.config)
        const children = [...f.childInvocations].sort((a, b) =>
            a.config.configurable.tool_call_id.localeCompare(b.config.configurable.tool_call_id)
        )
        expect(children.map(({ state }) => state[STATE_VARIABLE_HUMAN])).toEqual([
            { input: 'Review', caseId: 'case-1' },
            { input: 'Audit', reportId: 'report-1' }
        ])
        expect(children.map(({ config }) => config.configurable.tool_call_id)).toEqual(['mixed:0', 'mixed:1'])
        expect(children.map(({ config }) => config.configurable.xpertId)).toEqual(['expert-1', 'expert-2'])
        const reply = output.messages.find(
            (message) => isToolMessage(message) && message.name === PARALLEL_DELEGATION_TOOL
        )
        expect(JSON.parse(String(reply.content)).results.map((item) => item.assistant)).toEqual([
            'review_case',
            'audit_report'
        ])
    })

    it('rechecks revoked runtime resource access when a collection resumes', async () => {
        const f = fixture({ batch: true, dynamic: true, interruptInside: true })
        const { graph } = await f.handler.execute(f.command)
        await graph.invoke(f.input, f.config)
        f.resourceService.resolve.mockRejectedValue(new Error('Access revoked'))
        await expect(graph.invoke(new Command({ resume: 'approved' }), f.config)).rejects.toThrow('Access revoked')
        expect(f.childInvocations).toHaveLength(0)
    })

    it('keeps native business outcomes per item and runs caller tool guards for each delegated task', async () => {
        const guard = jest.fn<ReturnType<WrapToolCallHook>, Parameters<WrapToolCallHook>>((request, handler) =>
            handler(request)
        )
        const outcome: TAgentExecutionOutcome = { status: 'already_completed', subjectId: 'task-1', accepted: true }
        const f = fixture({ batch: true, outcome, guard })
        const { graph } = await f.handler.execute(f.command)
        const output = await graph.invoke(f.input, f.config)
        expect(guard.mock.calls.map(([request]) => request.toolCall.name)).toEqual([
            PARALLEL_DELEGATION_TOOL,
            'review_case',
            'review_case'
        ])
        const reply = output.messages.find(
            (message) => isToolMessage(message) && message.name === PARALLEL_DELEGATION_TOOL
        )
        const results = JSON.parse(String(reply.content)).results
        expect(results).toHaveLength(2)
        expect(results.map((item) => JSON.parse(item.result).businessOutcome)).toEqual([outcome, outcome])
        expect([...f.executions.values()].map((execution) => execution.metadata.sourceToolCallId)).toEqual([
            'batch-call:0',
            'batch-call:1'
        ])
    })

    it('returns one child failure without repeating or cancelling successful sibling work', async () => {
        let calls = 0
        const f = fixture({
            batch: true,
            onChild: async () => {
                if (++calls === 1) throw new Error('Review unavailable')
            }
        })
        const { graph } = await f.handler.execute(f.command)
        const output = await graph.invoke(f.input, f.config)
        const reply = output.messages.find(
            (message) => isToolMessage(message) && message.name === PARALLEL_DELEGATION_TOOL
        )
        expect(JSON.parse(String(reply.content)).results.map((item) => item.status)).toEqual(['failed', 'completed'])
        expect(f.childCommands).toHaveLength(2)
        expect(f.controller.signal.aborted).toBe(false)
    })

    it.each(['unknown', 'missing', 'extra', 'duplicate', 'too_many'])(
        'rejects %s batch inputs before starting any child',
        async (kind) => {
            const f = fixture({ batch: true })
            const valid = { assistant: 'review_case', arguments: { caseId: 'case-1', input: 'Review case-1' } }
            const tasks =
                kind === 'unknown'
                    ? [{ ...valid, assistant: 'unselected' }]
                    : kind === 'missing'
                      ? [valid, { assistant: 'review_case', arguments: { input: 'Review' } }]
                      : kind === 'extra'
                        ? [{ ...valid, arguments: { ...valid.arguments, tenantId: 'another-tenant' } }]
                        : kind === 'duplicate'
                          ? [valid, { ...valid, arguments: { input: 'Review case-1', caseId: 'case-1' } }]
                          : Array.from({ length: 33 }, () => valid)
            f.modelInvoke.mockResolvedValueOnce(
                new AIMessage({
                    content: '',
                    tool_calls: [{ id: 'invalid', name: PARALLEL_DELEGATION_TOOL, args: { tasks } }]
                })
            )
            const { graph } = await f.handler.execute(f.command)
            await graph.invoke(f.input, f.config)
            expect(f.childCommands).toHaveLength(0)
            expect(f.executions.size).toBe(0)
        }
    )

    it.each([{ parallel: false }, { parallel: true, interruptBefore: true }, { parallel: true, endNode: true }])(
        'does not offer a collection that bypasses disabled parallelism or graph controls: %j',
        async (settings) => {
            const f = fixture(settings)
            const { graph } = await f.handler.execute(f.command)
            await graph.invoke(f.input, f.config)
            const tools = f.model.bindTools.mock.calls[0][0]
            expect(tools.some((tool) => tool.name === PARALLEL_DELEGATION_TOOL)).toBe(false)
        }
    )

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
