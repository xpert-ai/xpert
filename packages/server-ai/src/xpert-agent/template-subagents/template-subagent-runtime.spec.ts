jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
jest.mock('../../xpert-middleware/thread-reference.runtime', () => ({
    createThreadReferenceMiddleware: jest.fn(async () => ({ key: 'references', middleware: { name: 'References' } }))
}))
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { AIMessage, HumanMessage } from '@langchain/core/messages'
import { StateGraph, START, END, MemorySaver, interrupt, Command } from '@langchain/langgraph'
import { RunnableConfig, RunnableLambda } from '@langchain/core/runnables'
import { tool } from '@langchain/core/tools'
import z from 'zod'
import { Subscriber } from 'rxjs'
import { AgentRuntimeRegistry, BUILTIN_GLOBAL_SCOPE, RequestContext } from '@xpert-ai/plugin-sdk'
import { XpertTypeEnum, XpertToolsetCategoryEnum } from '@xpert-ai/contracts'
import type { AssistantTemplateDefinition, IXpert, IXpertAgentExecution } from '@xpert-ai/contracts'
import { AgentInvocationRuntime } from '../../agent-invocation/invocation-runtime'
import { MemoryInvocationStore } from '../../agent-invocation/invocation-test-store'
import { NativeAgentRuntimeStrategy } from '../../agent-invocation/native-agent.strategy'
import type { AgentInvocationBuildContext } from '../../agent-invocation/agent-invocation-graph.service'
import {
    AuthorizeTemplateExecutionCommand,
    ResolveTemplateExecutionCommand
} from '../../agent-plugin/templates/resolve-template-execution.command'
import { CompileGraphCommand } from '../commands/compile-graph.command'
import { XpertAgentExecutionUpsertCommand } from '../../xpert-agent-execution/commands'
import { ResolveTemplateConnectorsCommand } from '../../connector/template-connectors.command'
import { XpertWorkAreaResolver, XpertRuntimeWorkArea } from '../../shared/volume/work-area'
import { VolumeHandle } from '../../shared/volume/volume'
import { ExecutionCancelService } from '../../execution-control/execution-cancel.service'
import { AgentStateAnnotation, CONVERSATION_OWNER_XPERT_ID } from '../../shared/agent/state'
import { TemplateSubagentRuntimeService } from './template-subagent-runtime.service'
import { createTemplateSubagentsMiddleware, templateSubagentToolName } from './template-subagents.middleware'
import type { RuntimeTemplateDescriptor } from '../../agent-plugin/templates/runtime-template'
import { XpertAgentSubgraphHandler } from '../commands/handlers/subgraph.handler'
import { CompileGraphHandler } from '../commands/handlers/compile-graph.handler'
import { XpertAgentSubgraphCommand } from '../commands/subgraph.command'
import { CreateNodeStagePendingSteerFollowUpsCommand } from '../commands/create-node-stage-pending-steer-follow-ups.command'
import { CreateNodeConsumePendingSteerFollowUpsCommand } from '../commands/create-node-consume-pending-steer-follow-ups.command'
import { ToolsetGetToolsCommand } from '../../xpert-toolset'
import { GetXpertChatModelQuery, GetXpertWorkflowQuery } from '../../xpert/queries'
import { CopilotGetOneQuery } from '../../copilot'
import { XpertAgentExecutionOneQuery } from '../../xpert-agent-execution/queries'
import { NativeAgentCompiler } from '../../agent-invocation/native-agent.compiler'
import { AgentInvocationGraphService } from '../../agent-invocation/agent-invocation-graph.service'
import { RuntimeResourceService, emptyRuntimeResources } from '../../agent-plugin/runtime-resource.service'
import { CopilotCheckpointSaver } from '../../copilot-checkpoint'
import { AgentMiddlewareRuntimeService } from '../../shared/agent/middleware-runtime'

const template: RuntimeTemplateDescriptor = {
    kind: 'agent_plugin_template',
    bindingId: 'package',
    version: 'v1',
    packageName: 'review',
    digest: 'digest',
    templateKey: 'reviewer',
    title: 'Reviewer',
    description: 'Review',
    parameters: []
}

describe('template invocation lifecycle', () => {
    let directory: string
    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), 'template-agent-'))
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
    })
    afterEach(async () => {
        jest.restoreAllMocks()
        await rm(directory, { recursive: true, force: true })
    })

    function fixture(pause = false) {
        const store = new MemoryInvocationStore()
        const registry = new AgentRuntimeRegistry({} as DiscoveryService, new Reflector())
        registry.register('xpert', new NativeAgentRuntimeStrategy(), {
            kind: 'builtin',
            scopeKey: BUILTIN_GLOBAL_SCOPE
        })
        const owner: IXpert = {
            id: 'owner',
            slug: 'owner',
            name: 'Owner',
            type: XpertTypeEnum.Agent,
            tenantId: 'tenant',
            organizationId: 'org',
            workspaceId: 'workspace'
        }
        const draft: AssistantTemplateDefinition = {
            team: { name: 'Reviewer', agent: { key: 'primary' } },
            nodes: [
                {
                    key: 'primary',
                    type: 'agent',
                    entity: { key: 'primary', prompt: 'Review' },
                    position: { x: 0, y: 0 }
                }
            ],
            connections: [],
            template: { schemaVersion: 2, dependencies: {} }
        }
        const calls: Array<{ state: typeof AgentStateAnnotation.State; config: RunnableConfig }> = []
        const saver = new MemorySaver()
        const graph = new StateGraph(AgentStateAnnotation)
            .addNode('review', async (state, config) => {
                if (pause) interrupt('Approve review')
                calls.push({ state, config })
                return { messages: [new AIMessage(`Reviewed ${state.human.input}`)] }
            })
            .addEdge(START, 'review')
            .addEdge('review', END)
            .compile({ checkpointer: saver })
        const executions = new Map<string, Partial<IXpertAgentExecution>>()
        const compile = jest.fn<ReturnType<CompileGraphHandler['execute']>, [CompileGraphCommand]>(
            async (_command) => ({ graph, agent: draft.team.agent, xpertGraph: draft })
        )
        const resolve = jest.fn(async () => ({ owner, prepared: { draft, locks: [], skills: {} } }))
        const authorize = jest.fn(async () => owner)
        const commands = {
            execute: jest.fn<Promise<unknown>, [unknown]>(async (command) => {
                if (command instanceof ResolveTemplateExecutionCommand) return resolve()
                if (command instanceof AuthorizeTemplateExecutionCommand) return authorize()
                if (command instanceof ResolveTemplateConnectorsCommand) return { connectors: [] }
                if (command instanceof CompileGraphCommand) return compile(command)
                if (command instanceof XpertAgentExecutionUpsertCommand) {
                    const execution = { ...executions.get(command.execution.id), ...command.execution }
                    executions.set(command.execution.id, execution)
                    return execution
                }
                throw new Error(`Unexpected command ${command?.constructor.name}`)
            })
        }
        const queries = {
            execute: jest.fn<Promise<unknown>, [unknown]>(async (query) =>
                query instanceof XpertAgentExecutionOneQuery ? executions.get(query.id) : undefined
            )
        }
        const volume = new VolumeHandle(
            { tenantId: 'tenant', catalog: 'xperts', xpertId: owner.id },
            directory,
            directory,
            '/files'
        )
        const area: XpertRuntimeWorkArea = {
            volume,
            volumeScope: volume.scope,
            volumePath: directory,
            workspaceRoot: directory,
            workingDirectory: directory,
            workspaceBinding: { volumeRoot: directory, workspaceRoot: directory, workspacePath: directory },
            defaultPath: { relativePath: '', serverPath: directory, workspacePath: directory }
        }
        const workAreas = { resolve: jest.fn().mockResolvedValue(area) }
        const cancellations = { attach: jest.fn(), check: jest.fn(), register: jest.fn(), unregister: jest.fn() }
        const invocations = new AgentInvocationRuntime(store, registry)
        const runtime = new TemplateSubagentRuntimeService(
            commands as unknown as CommandBus,
            queries as unknown as QueryBus,
            invocations,
            cancellations as unknown as ExecutionCancelService,
            workAreas as unknown as XpertWorkAreaResolver
        )
        const controller = new AbortController()
        const context: AgentInvocationBuildContext = {
            xpertId: owner.id,
            caller: owner,
            agentKey: 'leader',
            occupiedNames: [],
            selection: { revision: 1, resources: [{ bindingId: template.bindingId, version: template.version }] },
            options: {
                thread_id: 'thread',
                signal: controller.signal,
                rootController: controller,
                isDraft: false,
                isStart: true,
                execution: {},
                channel: 'leader',
                mute: [],
                store: undefined,
                subscriber: undefined
            }
        }
        const config: RunnableConfig = {
            configurable: {
                thread_id: 'thread',
                executionId: 'parent',
                tool_call_id: 'tool-1',
                runtimeState: {
                    messages: [new HumanMessage('private parent history')],
                    human: { input: 'parent', selectedSkillIds: ['private-skill'] },
                    sys: { language: 'en', timezone: 'UTC', date: '2026-10-15', profile: 'private parent profile' }
                }
            }
        }
        const invoke = (id = 'tool-1', text = 'case') =>
            runtime.invoke(
                template,
                { input: text },
                {
                    ...config,
                    configurable: { ...config.configurable, tool_call_id: id }
                },
                context,
                { model: 'fallback', copilotId: 'copilot' }
            )
        return {
            store,
            runtime,
            context,
            config,
            commands,
            queries,
            resolve,
            authorize,
            compile,
            calls,
            executions,
            invoke,
            graph,
            controller,
            draft,
            invocations,
            cancellations,
            owner
        }
    }

    it('is lazy, uses a task definition and does not create or publish an Assistant', async () => {
        const f = fixture()
        f.draft.team.copilotModel = {}
        createTemplateSubagentsMiddleware([template], (template, input, config) =>
            f.runtime.invoke(template, input, config, f.context)
        )
        expect(f.compile).not.toHaveBeenCalled()
        expect(await f.invoke()).toBe('Reviewed case')
        const command = f.compile.mock.calls[0][0]
        expect(command.options.executionDefinition.source).toEqual(
            expect.objectContaining({ templateKey: 'reviewer', digest: 'digest' })
        )
        expect(command.options.runtimeResources).toBeUndefined()
        expect(command.xpert.copilotModel).toMatchObject({ model: 'fallback', copilotId: 'copilot' })
        expect(f.calls[0].state.messages).toEqual([])
        expect(f.calls[0].state.human).toEqual({ input: 'case' })
        expect(f.calls[0].state.sys).not.toHaveProperty('profile')
        expect(f.calls[0].state.sys.workspace_path).toContain('/agent-tasks/')
        expect([...f.executions.values()][0].xpert.id).toBe('owner')
        expect([...f.executions.values()][0].metadata.templateSource.templateKey).toBe('reviewer')
    })

    it.each([undefined, 'conversation-owner'])(
        'keeps the conversation owner separate from the template executor (owner=%s)',
        async (conversationOwner) => {
            const f = fixture()
            f.context.options.conversationId = 'conversation'
            f.context.options[CONVERSATION_OWNER_XPERT_ID] = conversationOwner
            f.compile.mockRejectedValueOnce(new Error('compile boundary'))

            await expect(f.invoke()).rejects.toThrow('compile boundary')

            const command = f.compile.mock.calls[0][0]
            expect(command.options.conversationId).toBe('conversation')
            expect(command.options[CONVERSATION_OWNER_XPERT_ID]).toBe(conversationOwner ?? f.context.xpertId)
            expect(command.xpert.id).toBe(f.owner.id)
            expect(f.calls).toEqual([])
        }
    )

    it('replays a completed call without re-executing and rechecks access', async () => {
        const f = fixture()
        await f.invoke()
        expect(await f.invoke()).toBe('Reviewed case')
        expect(f.calls).toHaveLength(1)
        f.authorize.mockRejectedValueOnce(new Error('revoked'))
        await expect(f.invoke()).rejects.toThrow()
        expect(f.calls).toHaveLength(1)
    })

    it('isolates concurrent calls to the same template', async () => {
        const f = fixture()
        expect(await Promise.all([f.invoke('a', 'one'), f.invoke('b', 'two')])).toEqual([
            'Reviewed one',
            'Reviewed two'
        ])
        expect(new Set(f.calls.map((call) => call.config.configurable.checkpoint_ns)).size).toBe(2)
        expect(new Set(f.calls.map((call) => call.state.sys.workspace_path)).size).toBe(2)
        expect(f.store.rows.size).toBe(2)
    })

    it('does not start cancelled parent work', async () => {
        const f = fixture()
        f.controller.abort()
        await expect(f.invoke()).rejects.toThrow()
        expect(f.compile).not.toHaveBeenCalled()
    })

    it('reports missing dependencies, preserves failed calls and allows a fresh retry', async () => {
        const f = fixture()
        f.resolve.mockRejectedValueOnce(new Error('Missing skill dependency: review/evidence'))
        await expect(f.invoke()).rejects.toThrow('review/evidence')
        expect(f.compile).not.toHaveBeenCalled()
        expect([...f.store.rows.values()][0].invocation.status).toBe('failed')
        await expect(f.invoke()).rejects.toThrow('review/evidence')
        expect(f.resolve).toHaveBeenCalledTimes(1)
        expect(await f.invoke('retry')).toBe('Reviewed case')
    })

    it('propagates cancellation during a child run and releases its cancellation scope', async () => {
        const f = fixture()
        let started: () => void
        const ready = new Promise<void>((resolve) => {
            started = resolve
        })
        jest.spyOn(f.graph, 'invoke').mockImplementation(async (_input, config) => {
            started()
            return new Promise<never>((_resolve, reject) =>
                config.signal.addEventListener('abort', () => reject(config.signal.reason), { once: true })
            )
        })
        const pending = f.invoke()
        await ready
        f.controller.abort(new Error('parent cancelled'))
        await expect(pending).rejects.toThrow()
        expect([...f.store.rows.values()][0].invocation.status).toBe('cancelled')
        expect(f.cancellations.unregister).toHaveBeenCalledTimes(1)
    })

    it('resumes an approval inside the child without restarting completed work', async () => {
        const f = fixture(true)
        let fallback = 'fallback'
        const parent = new StateGraph(AgentStateAnnotation)
            .addNode('delegate', async (state, config) => {
                const text = await f.runtime.invoke(
                    template,
                    { input: 'case' },
                    {
                        ...config,
                        configurable: {
                            ...config.configurable,
                            executionId: 'parent',
                            tool_call_id: 'tool-1',
                            runtimeState: state
                        }
                    },
                    f.context,
                    { model: fallback, copilotId: 'copilot' }
                )
                return { messages: [new AIMessage(text)] }
            })
            .addEdge(START, 'delegate')
            .addEdge('delegate', END)
            .compile({ checkpointer: new MemorySaver() })
        const config = { configurable: { thread_id: 'thread' } }
        await parent.invoke(f.config.configurable.runtimeState, config)
        expect(f.calls).toHaveLength(0)
        expect([...f.store.rows.values()][0].invocation.status).toBe('waiting')
        fallback = 'new-parent-model'
        const output = await parent.invoke(new Command({ resume: true }), config)
        expect(f.calls).toHaveLength(1)
        expect(output.messages.at(-1).content).toBe('Reviewed case')
        expect([...f.store.rows.values()][0].invocation.status).toBe('succeeded')
        expect(f.compile.mock.calls.at(-1)[0].xpert.copilotModel.model).toBe('fallback')
    })

    it('compiles the full template graph and executes its internal Agent and toolset', async () => {
        const f = fixture()
        f.context.options.subscriber = new Subscriber<MessageEvent>()
        f.context.options.environment = {
            name: 'parent-env',
            variables: [{ name: 'PARENT_SECRET', value: 'private', type: 'secret' }]
        }
        f.draft.nodes[0].entity = {
            key: 'primary',
            name: 'reviewer',
            prompt: 'Delegate evidence checking.',
            options: { fileUnderstanding: { enabled: false } }
        }
        f.draft.nodes.push(
            {
                key: 'worker',
                type: 'agent',
                entity: {
                    key: 'worker',
                    name: 'evidence_worker',
                    description: 'Check evidence',
                    prompt: 'Use check_evidence.',
                    options: { fileUnderstanding: { enabled: false } }
                },
                position: { x: 0, y: 0 }
            },
            {
                key: 'evidence-tools',
                type: 'toolset',
                entity: {
                    id: 'evidence-tools',
                    name: 'evidence-tools',
                    type: 'mcp',
                    category: XpertToolsetCategoryEnum.MCP
                },
                position: { x: 0, y: 0 }
            }
        )
        f.draft.connections.push(
            { key: 'primary-worker', type: 'agent', from: 'primary', to: 'worker' },
            { key: 'worker-tools', type: 'toolset', from: 'worker', to: 'evidence-tools' }
        )
        const evidence = jest.fn(async () => 'Evidence verified')
        const close = jest.fn(async () => undefined)
        const toolset = {
            getId: () => 'evidence-tools',
            getName: () => 'evidence',
            providerName: 'mcp',
            getToolTitle: () => 'Check evidence',
            getVariables: async () => [],
            close,
            initTools: async () => [
                tool(evidence, { name: 'check_evidence', description: 'Verify evidence', schema: z.object({}) })
            ]
        }
        const commandBus = f.commands as unknown as CommandBus
        const queryBus = f.queries as unknown as QueryBus
        const native = new AgentInvocationGraphService(
            commandBus,
            queryBus,
            {} as RuntimeResourceService,
            f.invocations,
            new NativeAgentCompiler(commandBus, queryBus),
            f.cancellations as unknown as ExecutionCancelService
        )
        const handler = new XpertAgentSubgraphHandler(
            new MemorySaver() as unknown as CopilotCheckpointSaver,
            commandBus,
            queryBus,
            { t: jest.fn(), translate: jest.fn() } as never,
            null,
            {
                createScopedApi: () => ({}),
                resolveSelectedConnectorRuntimeBindings: async () => []
            } as unknown as AgentMiddlewareRuntimeService,
            { findOne: async (id: string) => ({ id }) } as never
        )
        const resources = { ...emptyRuntimeResources(), selection: f.context.selection, templates: [template] }
        const resourceService = { resolve: jest.fn(async () => resources) }
        Object.defineProperties(handler, {
            invocationGraph: { value: native },
            agentMiddlewareRegistry: { value: { get: jest.fn() } },
            templateSubagents: { value: f.runtime },
            runtimeResourceService: { value: resourceService }
        })
        const dispatch = f.commands.execute.getMockImplementation()
        f.commands.execute.mockImplementation(async (command) => {
            if (command instanceof XpertAgentSubgraphCommand) return handler.execute(command)
            if (command instanceof ToolsetGetToolsCommand)
                return command.ids.includes('evidence-tools') ? [toolset] : []
            if (command instanceof CreateNodeStagePendingSteerFollowUpsCommand)
                return RunnableLambda.from(() => ({ pending_follow_ups: [] }))
            if (command instanceof CreateNodeConsumePendingSteerFollowUpsCommand) return RunnableLambda.from(() => ({}))
            return dispatch(command)
        })
        const modelCalls: string[] = []
        const boundTools = new Map<string, string[]>()
        const parentTeam = { ...f.owner, copilotModel: { copilotId: 'copilot', model: 'fallback' } }
        const parentAgent = {
            key: 'leader',
            name: 'Parent',
            prompt: 'Delegate the review.',
            team: parentTeam,
            options: { fileUnderstanding: { enabled: false } }
        }
        f.queries.execute.mockImplementation(async (query) => {
            if (query instanceof GetXpertWorkflowQuery)
                return {
                    agent: parentAgent,
                    graph: {
                        nodes: [{ key: 'leader', type: 'agent', entity: parentAgent, position: { x: 0, y: 0 } }],
                        connections: []
                    },
                    next: [],
                    fail: []
                }
            if (query instanceof XpertAgentExecutionOneQuery) return f.executions.get(query.id)
            if (query instanceof CopilotGetOneQuery) return { modelProvider: { providerName: 'test' } }
            if (query instanceof GetXpertChatModelQuery) {
                const worker = query.agent.key === 'worker'
                const parent = query.agent.key === 'leader'
                const model = Object.assign(
                    RunnableLambda.from(async (messages: Array<HumanMessage | AIMessage>) => {
                        modelCalls.push(query.agent.key)
                        return messages.some((message) => message.getType() === 'tool')
                            ? new AIMessage(
                                  worker
                                      ? 'Evidence verified'
                                      : parent
                                        ? 'Parent report complete'
                                        : 'Template report complete'
                              )
                            : new AIMessage({
                                  content: '',
                                  tool_calls: [
                                      {
                                          id: worker ? 'evidence' : 'worker',
                                          name: worker
                                              ? 'check_evidence'
                                              : parent
                                                ? templateSubagentToolName(template)
                                                : 'evidenceworker',
                                          args: worker ? {} : { input: 'Verify evidence' }
                                      }
                                  ]
                              })
                    }),
                    { bindTools: jest.fn() }
                )
                model.bindTools.mockImplementation((tools: Array<{ name: string }>) => {
                    boundTools.set(
                        query.agent.key,
                        tools.map((tool) => tool.name)
                    )
                    return model
                })
                return model
            }
            throw new Error(`Unexpected query ${query.constructor.name}`)
        })
        f.compile.mockImplementation((command) => new CompileGraphHandler(commandBus, queryBus).execute(command))
        const root = await new CompileGraphHandler(commandBus, queryBus).execute(
            new CompileGraphCommand('leader', parentTeam, {
                ...f.context.options,
                execution: { id: 'parent' },
                runtimeResources: resources
            })
        )
        const output = await root.graph.invoke(f.config.configurable.runtimeState, f.config)
        expect(output.messages.at(-1).content).toBe('Parent report complete')
        expect(boundTools.get('leader')).toContain(templateSubagentToolName(template))
        expect(boundTools.get('primary')).not.toContain(templateSubagentToolName(template))
        expect(boundTools.get('worker')).not.toContain(templateSubagentToolName(template))
        expect(modelCalls).toContain('worker')
        expect(evidence).toHaveBeenCalledTimes(1)
        expect(close).toHaveBeenCalledTimes(1)
        expect(f.compile.mock.calls[0][0].options.environment).toBeUndefined()
        expect([...f.executions.values()].every((execution) => execution.xpert.id === 'owner')).toBe(true)
    })
})
