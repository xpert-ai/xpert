import {
    AIMessage,
    isAIMessage,
    isBaseMessage,
    isToolMessage,
    RemoveMessage,
    ToolMessage
} from '@langchain/core/messages'
import { SystemMessagePromptTemplate } from '@langchain/core/prompts'
import { RunnableConfig, RunnableLambda } from '@langchain/core/runnables'
import { DynamicStructuredTool, StructuredToolInterface } from '@langchain/core/tools'
import {
    Annotation,
    BaseStore,
    CompiledStateGraph,
    END,
    GraphInterrupt,
    isCommand,
    isParentCommand,
    START,
    StateGraph
} from '@langchain/langgraph'
import { Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import {
    channelName,
    ChatMessageEventTypeEnum,
    GRAPH_NODE_TITLE_CONVERSATION,
    IXpert,
    IXpertAgent,
    IXpertAgentExecution,
    IXpertProject,
    STATE_VARIABLE_HUMAN,
    TAgentRunnableConfigurable,
    TStateVariable,
    TXpertAgentConfig,
    WorkflowNodeTypeEnum,
    XpertAgentExecutionStatusEnum
} from '@xpert-ai/contracts'
import { getErrorMessage } from '@xpert-ai/server-common'
import { Subscriber } from 'rxjs'
import { CopilotGetChatQuery } from '../../../copilot'
import { CopilotCheckpointSaver } from '../../../copilot-checkpoint'
import { CopilotModelGetChatModelQuery } from '../../../copilot-model'
import { prepareMessagesForModel } from '../../../copilot-model/model-capabilities'
import {
    AgentStateAnnotation,
    ConversationTitleService,
    CreateMemoryStoreCommand,
    stateToParameters,
    stateVariable,
    TAgentSubgraphParams,
    ToolNode,
    translate
} from '../../../shared'
import { avatarForChat } from '../../../shared/avatar'
import { CompileGraphCommand, messageEvent } from '../../../xpert-agent'
import {
    assignExecutionUsage,
    XpertAgentExecutionOneQuery,
    XpertAgentExecutionUpsertCommand
} from '../../../xpert-agent-execution'
import { XpertProjectService } from '../../../xpert-project/'
import { AgentMiddlewareRegistry, RequestContext } from '@xpert-ai/plugin-sdk'
import { AgentMiddlewareRuntimeService } from '../../../shared/agent/middleware-runtime'
import { inheritMiddlewareToolDisplayMetadata } from '../../../shared/agent/middleware'
import {
    PROJECT_TASKS_MIDDLEWARE,
    PROJECT_TASKS_MIDDLEWARE_NODE
} from '../../../xpert-project/plugins/project-tasks/constants'
import { ChatCommonCommand } from '../chat-common.command'
import { _normalizeAgentName, createHandoffBackMessages, createHandoffTool } from './handoff'
import {
    Instruction,
    isChatModelWithBindTools,
    isChatModelWithParallelToolCallsParam,
    OutputMode,
    PlanInstruction,
    ProjectTaskInstruction,
    PROVIDERS_WITH_PARALLEL_TOOL_CALLS_PARAM
} from './supervisor'

/** Graph construction is separate from conversation lifecycle and message persistence. */
export class ChatCommonAgentBuilder {
    readonly #logger = new Logger(ChatCommonAgentBuilder.name)
    constructor(
        private readonly checkpointSaver: CopilotCheckpointSaver,
        private readonly projectService: XpertProjectService,
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus,
        private readonly conversationTitleService: ConversationTitleService,
        private readonly middlewareRegistry: AgentMiddlewareRegistry,
        private readonly middlewareRuntime: AgentMiddlewareRuntimeService
    ) {}
    async createReactAgent(
        command: ChatCommonCommand,
        project: IXpertProject,
        execution: IXpertAgentExecution,
        abortController: AbortController,
        subscriber: Subscriber<MessageEvent>,
        conversationId: string,
        mute: TXpertAgentConfig['mute']
    ) {
        const projectId = project?.id
        const { tenantId, organizationId } = command.options

        // Long-term memory store
        const memoryStore: BaseStore = await this.commandBus.execute<CreateMemoryStoreCommand, BaseStore>(
            new CreateMemoryStoreCommand(tenantId, organizationId, null, {
                abortController,
                tokenCallback: (token) => {
                    // execution.embedTokens += token ?? 0
                }
            })
        )

        // Create tools
        const stateVariables: TStateVariable[] = []
        const tools: StructuredToolInterface[] = []
        /**
         * Map of tool names to their titles
         */
        const toolsTitleMap = {}
        /**
         * The relationship between tool and toolset provider
         */
        const toolsetsMap: Record<string, { provider: string; toolsetId: string }> = {}
        // Project supervisors mount the same registered Plugin used by configurable Assistant middleware nodes.
        if (project?.id) {
            const strategy = this.middlewareRegistry.get(PROJECT_TASKS_MIDDLEWARE)
            const scope = {
                tenantId,
                organizationId,
                userId: RequestContext.currentUserId(),
                workspaceId: project.workspaceId,
                projectId,
                conversationId,
                executionId: execution.id,
                threadId: execution.threadId,
                agentKey: 'general_agent'
            }
            const middleware = inheritMiddlewareToolDisplayMetadata(
                await strategy.createMiddleware(
                    {},
                    {
                        ...scope,
                        callerType: 'project_agent',
                        store: memoryStore,
                        tools: new Map(),
                        runtime: this.middlewareRuntime.createScopedApi(scope),
                        node: {
                            id: PROJECT_TASKS_MIDDLEWARE_NODE,
                            key: PROJECT_TASKS_MIDDLEWARE_NODE,
                            type: WorkflowNodeTypeEnum.MIDDLEWARE,
                            provider: PROJECT_TASKS_MIDDLEWARE,
                            required: true
                        }
                    }
                ),
                strategy.meta
            )
            for (const tool of middleware.tools ?? []) {
                toolsTitleMap[tool.name] = tool.metadata?.toolName ?? tool.name
                toolsetsMap[tool.name] = { provider: middleware.name, toolsetId: null }
                tools.push(tool)
            }
        }

        this.#logger.debug(
            `Project general agent use tools:\n${[...tools].map((_, i) => `${i + 1}. ` + _.name + ': ' + _.description).join('\n')}`
        )

        // Find an available copilot
        const configuredSupervisorModel = project?.copilotModel
        let copilot = configuredSupervisorModel?.copilot
        if (!configuredSupervisorModel) {
            copilot = await this.queryBus.execute(new CopilotGetChatQuery(tenantId, organizationId))
        }
        const supervisorModel = configuredSupervisorModel ?? copilot?.copilotModel
        execution.metadata = {
            provider: copilot.modelProvider?.providerName,
            model: supervisorModel?.model
        }

        const llm = await this.queryBus.execute(
            new CopilotModelGetChatModelQuery(copilot, supervisorModel, {
                abortController,
                usageCallback: assignExecutionUsage(execution)
            })
        )

        const supervisorName = 'general_agent'
        // Custom Xperts
        const xperts: { name: string; agent; tool: DynamicStructuredTool }[] = []
        if (project?.xperts.length) {
            for await (const xpert of project.xperts) {
                const agent = await this.createXpertAgent({
                    project,
                    xpert,
                    abortController,
                    execution,
                    subscriber,
                    outputMode: 'last_message',
                    addHandoffBackMessages: false,
                    supervisorName,
                    mute,
                    store: memoryStore,
                    isDraft: false
                })
                const tool = createHandoffTool({
                    agentName: agent.name,
                    title: xpert.title,
                    description: xpert.description,
                    onHandoff: async ({ taskId, config }) => {
                        if (!project?.id || !taskId) return
                        await this.projectService.assertToolPermission(project.id, 'edit')
                        const configurable = (config as { configurable?: TAgentRunnableConfigurable } | undefined)
                            ?.configurable
                        const delegated = await this.projectService.createTaskExecution(project.id, taskId, {
                            conversationId,
                            threadId: configurable?.thread_id,
                            agentExecutionId: configurable?.executionId,
                            xpertId: xpert.id,
                            agentKey: xpert.agent?.key || agent.name,
                            status: 'queued',
                            inputSummary: 'Delegated by a project expert'
                        })
                        if (conversationId) {
                            await this.projectService.linkTaskConversation(project.id, taskId, {
                                conversationId,
                                relationType: 'execution',
                                sourceExecutionId: delegated.id
                            })
                        }
                        return delegated.id
                    }
                })
                xperts.push({ name: agent.name, agent, tool })
                toolsTitleMap[tool.name] =
                    translate({ en_US: 'Task handoff to:', zh_Hans: '任务移交给：' }) + (xpert.title || xpert.name)
                toolsetsMap[tool.name] = { provider: 'transfer_to', toolsetId: null }
            }
        }
        const shouldReturnDirect = new Set(
            tools.filter((tool) => 'returnDirect' in tool && tool.returnDirect).map((tool) => tool.name)
        )
        const routeToolResponses = (state: typeof AgentStateAnnotation.State) => {
            // Check the last consecutive tool calls
            for (let i = state.messages.length - 1; i >= 0; i -= 1) {
                const message = state.messages[i]
                if (!isToolMessage(message)) {
                    break
                }
                // Check if this tool is configured to return directly
                if (message.name !== undefined && shouldReturnDirect.has(message.name)) {
                    return END
                }
                // Check if this tool is handoff tool
                const xpert = xperts.find((_) => _.tool.name === message.name)
                if (xpert) {
                    return xpert.name
                }
            }
            return supervisorName
        }

        const thread_id = execution.threadId

        const allTools = [...(tools ?? []), ...xperts.map(({ tool }) => tool)]

        const agentNames = new Set<string>()
        for (const xpert of xperts) {
            const agent = xpert.agent
            if (!agent.name || agent.name === 'LangGraph') {
                throw new Error(
                    'Please specify a name when you create your agent, either via `createReactAgent({ ..., name: agentName })` ' +
                        'or via `graph.compile({ name: agentName })`.'
                )
            }

            if (agentNames.has(agent.name)) {
                throw new Error(`Agent with name '${agent.name}' already exists. Agent names must be unique.`)
            }

            agentNames.add(agent.name)
        }

        let supervisorLLM = llm
        if (allTools.length && isChatModelWithBindTools(llm)) {
            if (
                isChatModelWithParallelToolCallsParam(llm) &&
                PROVIDERS_WITH_PARALLEL_TOOL_CALLS_PARAM.has(llm.getName())
            ) {
                supervisorLLM = llm.bindTools(allTools, { parallel_tool_calls: false })
            } else {
                supervisorLLM = llm.bindTools(allTools)
            }
        }

        let supervisorPrompt = ''
        if (xperts.length > 0) {
            supervisorPrompt +=
                '\nYou are a team leader who manages the following experts. Please assign them tasks to solve user problems:' +
                project.xperts.reduce((prompt, xpert) => {
                    prompt += `- xpert_${xpert.slug}: I am ${xpert.title || xpert.name}. ${xpert.description}\n\n`
                    return prompt
                }, '')
        }

        const stateAnnotation = createStateAnnotation(stateVariables)

        const callModel = async (state: typeof AgentStateAnnotation.State, config?: RunnableConfig) => {
            const parameters = stateToParameters(state)
            let systemTemplate =
                `Current time: ${new Date().toISOString()}\n` +
                (project?.settings?.instruction || supervisorPrompt) +
                '\n\n' +
                Instruction

            if (project?.id) systemTemplate += `\n\n${ProjectTaskInstruction}`

            if (project?.settings?.mode === 'plan') {
                systemTemplate += `\n\n` + PlanInstruction
            }

            // const files = await fileToolset?.listFiles('project', projectId)
            // if (files) {
            // 	systemTemplate += '\n\n' + `The list of files in the current workspace is:\n${files.map(({filePath}) => filePath).join('\n') || 'No files yet.'}\n`
            // }
            const systemMessage = await SystemMessagePromptTemplate.fromTemplate(systemTemplate, {
                templateFormat: 'mustache'
            }).format(parameters)

            this.#logger.verbose(`System message of project general agent:`, systemMessage.content)
            const messages = prepareMessagesForModel(state.messages, llm)
            return { messages: [await supervisorLLM.invoke([systemMessage, ...messages], config)] }
        }

        let builder = new StateGraph(stateAnnotation)
            .addNode(
                supervisorName,
                new RunnableLambda({ func: callModel }).withConfig({
                    runName: supervisorName,
                    tags: [thread_id, projectId]
                })
            )
            .addEdge(START, supervisorName)
            .addNode('tools', new ToolNode(allTools, { toolsets: toolsetsMap }), { metadata: { ...toolsTitleMap } })
            .addConditionalEdges('tools', routeToolResponses)
            .addConditionalEdges(supervisorName, (state, config) => {
                const { title } = state
                const messages = state.messages ?? []
                const lastMessage = messages[messages.length - 1]
                if (isBaseMessage(lastMessage) && isAIMessage(lastMessage)) {
                    if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
                        if (!title) {
                            return GRAPH_NODE_TITLE_CONVERSATION
                        }
                    } else {
                        return 'tools'
                    }
                }
                return END
            })

        const titleAgent = RunnableLambda.from(
            async (state: typeof AgentStateAnnotation.State, config?: RunnableConfig) =>
                await this.conversationTitleService.generateStatePatch({
                    channel: null,
                    config,
                    copilot,
                    state
                })
        )

        builder.addNode(GRAPH_NODE_TITLE_CONVERSATION, titleAgent).addEdge(GRAPH_NODE_TITLE_CONVERSATION, END)

        for (const xpert of xperts) {
            const agent = xpert.agent
            builder = builder.addNode(agent.name, agent, {
                subgraphs: [agent]
            })
            builder = builder.addEdge(agent.name, supervisorName)
        }

        return builder.compile({
            checkpointer: this.checkpointSaver
        })
    }

    /**
     * Create agent graph for xpert
     */
    async createXpertAgent(
        params: TAgentSubgraphParams & {
            project: IXpertProject
            xpert: IXpert
            abortController: AbortController
            execution: IXpertAgentExecution
            subscriber: Subscriber<MessageEvent>
            outputMode: OutputMode
            addHandoffBackMessages: boolean
            supervisorName: string
        }
    ) {
        const {
            project,
            xpert,
            abortController,
            execution,
            subscriber,
            outputMode,
            addHandoffBackMessages,
            supervisorName,
            mute
        } = params
        const name = `xpert_` + xpert.slug
        // Sub execution for xpert
        const _execution: IXpertAgentExecution = {}
        const { graph, agent } = await this.commandBus.execute<
            CompileGraphCommand,
            {
                graph: CompiledStateGraph<
                    unknown,
                    unknown,
                    string,
                    typeof AgentStateAnnotation.spec,
                    typeof AgentStateAnnotation.spec
                >
                agent: IXpertAgent
            }
        >(
            new CompileGraphCommand(xpert.agent.key, xpert, {
                mute: params.mute,
                store: params.store,
                execution: _execution,
                rootExecutionId: execution.id,
                rootController: abortController,
                signal: abortController.signal,
                subscriber,
                projectId: project?.id,
                isDraft: false,
                environment: params.environment
            })
        )

        const runnable = new RunnableLambda({
            func: async (state: typeof AgentStateAnnotation.State, config) => {
                const configurable: TAgentRunnableConfigurable = config.configurable
                const { subscriber } = configurable
                // Record start time
                const timeStart = Date.now()
                const __execution = await this.commandBus.execute(
                    new XpertAgentExecutionUpsertCommand({
                        ..._execution,
                        threadId: config.configurable.thread_id,
                        checkpointNs: config.configurable.checkpoint_ns,
                        xpert: { id: xpert.id } as IXpert,
                        // agentKey: xpert.agent.key,
                        inputs: { input: state.input },
                        parentId: execution.id,
                        metadata: {
                            ..._execution.metadata,
                            invocationKind: 'external_assistant',
                            assistantName: xpert.title || xpert.name,
                            assistantAvatar: avatarForChat(xpert.avatar)
                        },
                        status: XpertAgentExecutionStatusEnum.RUNNING,
                        predecessor: configurable.agentKey
                    })
                )

                const projectTaskExecution = project?.id
                    ? await this.projectService.claimTaskExecution(project.id, {
                          threadId: config.configurable.thread_id,
                          xpertId: xpert.id,
                          agentExecutionId: __execution.id
                      })
                    : null

                // Start agent execution event
                subscriber.next(messageEvent(ChatMessageEventTypeEnum.ON_AGENT_START, __execution))

                // Exec
                let status = XpertAgentExecutionStatusEnum.SUCCESS
                let error = null
                let result = ''
                const finalize = async () => {
                    const _state = await graph.getState(config)

                    const timeEnd = Date.now()
                    // Record End time
                    const ___execution = await this.commandBus.execute(
                        new XpertAgentExecutionUpsertCommand({
                            ..._execution,
                            id: __execution.id,
                            metadata: {
                                ..._execution.metadata,
                                invocationKind: 'external_assistant',
                                assistantName: xpert.title || xpert.name,
                                assistantAvatar: avatarForChat(xpert.avatar)
                            },
                            checkpointId: _state.config.configurable.checkpoint_id,
                            elapsedTime: timeEnd - timeStart,
                            status,
                            error,
                            outputs: {
                                output: result
                            }
                        })
                    )

                    if (projectTaskExecution) {
                        await this.projectService.updateTaskExecution(
                            project.id,
                            projectTaskExecution.taskId,
                            projectTaskExecution.id,
                            {
                                status: status === XpertAgentExecutionStatusEnum.SUCCESS ? 'succeeded' : 'failed',
                                outputSummary:
                                    status === XpertAgentExecutionStatusEnum.SUCCESS
                                        ? 'Assistant execution completed'
                                        : undefined,
                                error: status === XpertAgentExecutionStatusEnum.SUCCESS ? undefined : error,
                                completedAt: new Date()
                            }
                        )
                    }

                    const fullExecution = await this.queryBus.execute(new XpertAgentExecutionOneQuery(___execution.id))

                    // End agent execution event
                    subscriber.next(messageEvent(ChatMessageEventTypeEnum.ON_AGENT_END, fullExecution))
                }

                const _messages = Array.from(state.messages)
                const primaryChannelName = channelName(xpert.agent.key)
                let toolMessage = null
                let aiMessage: AIMessage = null
                while (_messages.length > 0) {
                    const message = _messages.pop()
                    if (isBaseMessage(message)) {
                        if (isAIMessage(message)) {
                            aiMessage = message
                            break
                        } else if (isToolMessage(message) && message.name.includes(_normalizeAgentName(name))) {
                            toolMessage = message
                        }
                    }
                }
                if (!aiMessage) {
                    throw new Error(`CAN NOT found AiMessage for transfer back of xpert`)
                }
                if (!toolMessage) {
                    throw new Error(`CAN NOT found ToolMessage for transfer back of xpert`)
                }
                let input = null
                let tool_call_id = null
                let tool_name = null
                const toolCalls = Array.from(aiMessage.tool_calls)
                while (toolCalls.length > 0) {
                    const tool_call = toolCalls.pop()
                    if (tool_call.name.includes(_normalizeAgentName(name))) {
                        input = tool_call.args?.input
                        tool_call_id = tool_call.id
                        tool_name = tool_call.name
                        break
                    }
                }

                try {
                    const output = await graph.invoke(
                        {
                            ...state,
                            input: input,
                            [STATE_VARIABLE_HUMAN]: {
                                input,
                                files: state.human?.files || []
                            },
                            messages: [],
                            [primaryChannelName]: {
                                messages: []
                            }
                        },
                        {
                            ...config,
                            configurable: {
                                ...config.configurable,
                                agentKey: '', // In the general agent, messages do not distinguish between Agents but only between Xperts.
                                xpertName: xpert.name
                            },
                            metadata: {
                                agentKey: '', // In the general agent, messages do not distinguish between Agents but only between Xperts.
                                xpertName: xpert.name
                            }
                        }
                    )

                    let { messages } = output

                    const lastMessage = messages[messages.length - 1]
                    if (lastMessage && isAIMessage(lastMessage)) {
                        result = lastMessage.content as string
                    }

                    if (outputMode === 'last_message') {
                        messages = [
                            new ToolMessage({
                                name: tool_name,
                                content: result,
                                tool_call_id
                            })
                        ]
                    }

                    if (addHandoffBackMessages) {
                        messages.push(...createHandoffBackMessages(agent.name, supervisorName))
                    }
                    return { ...output, messages: [new RemoveMessage({ id: toolMessage.id }), ...messages] }
                } catch (err) {
                    if (err instanceof GraphInterrupt) {
                        status = XpertAgentExecutionStatusEnum.INTERRUPTED
                    } else if (!isParentCommand(err) && !isCommand(err)) {
                        error = getErrorMessage(err)
                        status = XpertAgentExecutionStatusEnum.ERROR
                    }
                    throw err
                } finally {
                    // End agent execution event
                    await finalize()
                }
            }
        }).withConfig({ tags: [xpert.id] })
        runnable.name = name

        if (xpert.agentConfig?.mute?.length) {
            mute.push(...xpert.agentConfig.mute.map((_) => [xpert.id, ..._]))
        }
        return runnable
    }
}

function createStateAnnotation(stateVariables: TStateVariable[]) {
    return Annotation.Root({
        ...AgentStateAnnotation.spec, // Common agent states
        // Global conversation variables
        ...(stateVariables.reduce((acc, variable) => {
            acc[variable.name] = Annotation({
                ...(variable.reducer
                    ? {
                          reducer: variable.reducer,
                          default: variable.default
                      }
                    : stateVariable(variable))
            })
            return acc
        }, {}) ?? {})
    })
}
