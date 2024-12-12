import { NotFoundException } from '@nestjs/common'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { AIMessage, AIMessageChunk, HumanMessage, isAIMessageChunk, mapStoredMessageToChatMessage, MessageContent, SystemMessage } from '@langchain/core/messages'
import { get_lc_unique_name, Serializable } from '@langchain/core/load/serializable'
import { SystemMessagePromptTemplate } from '@langchain/core/prompts'
import { NodeInterrupt, StateGraphArgs } from '@langchain/langgraph'
import { agentLabel, ChatMessageEventTypeEnum, ChatMessageTypeEnum, ICopilot, IXpertAgent } from '@metad/contracts'
import { AgentRecursionLimit, isNil } from '@metad/copilot'
import { RequestContext } from '@metad/server-core'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { concat, filter, from, Observable, of, switchMap, tap } from 'rxjs'
import { AgentState, CopilotGetOneQuery, createCopilotAgentState } from '../../../copilot'
import { CopilotCheckpointSaver } from '../../../copilot-checkpoint'
import { BaseToolset, ToolsetGetToolsCommand } from '../../../xpert-toolset'
import { createXpertAgentTool, XpertAgentExecuteCommand } from '../execute.command'
import { GetXpertAgentQuery } from '../../../xpert/queries'
import { XpertCopilotNotFoundException } from '../../../core/errors'
import { XpertAgentExecutionUpsertCommand } from '../../../xpert-agent-execution/commands'
import { createKnowledgeRetriever } from '../../../knowledgebase/retriever'
import { EnsembleRetriever } from "langchain/retrievers/ensemble"
import z from 'zod'
import { CopilotModelGetChatModelQuery } from '../../../copilot-model/queries'
import { createReactAgent } from './react_agent_executor'
import { ToolNode } from './tool_node'


export type ChatAgentState = AgentState
export const chatAgentState: StateGraphArgs<ChatAgentState>['channels'] = {
	...createCopilotAgentState()
}

@CommandHandler(XpertAgentExecuteCommand)
export class XpertAgentExecuteHandler implements ICommandHandler<XpertAgentExecuteCommand> {
	readonly #logger = new Logger(XpertAgentExecuteHandler.name)

	constructor(
		// private readonly agentService: XpertAgentService,
		private readonly copilotCheckpointSaver: CopilotCheckpointSaver,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: XpertAgentExecuteCommand): Promise<Observable<MessageContent>> {
		const { input, agentKey, xpert, options } = command
		const { execution, subscriber, message } = options
		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()
		const user = RequestContext.currentUser()
		const abortController = new AbortController()

		const agent = await this.queryBus.execute<GetXpertAgentQuery, IXpertAgent>(new GetXpertAgentQuery(xpert.id, agentKey, command.options?.isDraft))
		if (!agent) {
			throw new NotFoundException(`Xpert agent not found for '${xpert.name}' and key ${agentKey} draft is ${command.options?.isDraft}`)
		}

		const team = agent.team
		let copilot: ICopilot = null
		const copilotId = agent.copilotModel?.copilotId ?? team.copilotModel?.copilotId
		const copilotModel = agent.copilotModel ?? team.copilotModel
		if (copilotId) {
			copilot = await this.queryBus.execute(new CopilotGetOneQuery(tenantId, copilotId, ['modelProvider']))
		} else {
			throw new XpertCopilotNotFoundException(`Xpert copilot not found for '${xpert.name}'`)
		}

		const chatModel = await this.queryBus.execute<CopilotModelGetChatModelQuery, BaseChatModel>(
			new CopilotModelGetChatModelQuery(copilot, copilotModel, {abortController, tokenCallback: (token) => {
				execution.tokens += (token ?? 0)
			}})
		)

		const toolsets = await this.commandBus.execute<ToolsetGetToolsCommand, BaseToolset[]>(
			new ToolsetGetToolsCommand(options?.toolsets ?? agent.toolsetIds)
		)
		const tools = []
		const sensitiveTools = []
		for await (const toolset of toolsets) {
			const items = await toolset.initTools()
			items.forEach((item) => {
				const lc_name = get_lc_unique_name(item.constructor as typeof Serializable)
				if (team.agentConfig?.interruptBefore?.includes(lc_name)) {
					sensitiveTools.push(item)
				} else {
					tools.push(item)
				}
			})
		}

		this.#logger.debug(`Use tools:\n ${[...tools, ...sensitiveTools].map((_) => _.name + ': ' + _.description).join('\n')}`)

		// Knowledgebases
		const knowledgebaseIds = options?.knowledgebases ?? agent.knowledgebaseIds
		if (knowledgebaseIds?.length) {
			const retrievers = knowledgebaseIds.map((id) => createKnowledgeRetriever(this.queryBus, id))
			const retriever = new EnsembleRetriever({
				retrievers: retrievers,
				weights: retrievers.map(() => 0.5),
			  })
			tools.push(retriever.asTool({
				name: "knowledge_retriever",
				description: "Get information about question.",
				schema: z.string(),
			  }))
		}

		if (agent.followers?.length) {
			this.#logger.debug(`Use sub agents:\n ${agent.followers.map((_) => _.name)}`)
			agent.followers.forEach((follower) => {
				tools.push(createXpertAgentTool(
					this.commandBus,
					this.queryBus,
					{
						xpert,
						agent: follower,
						options: {
							rootExecutionId: command.options.rootExecutionId,
							isDraft: command.options.isDraft,
							subscriber
						}
					}
				))
			})
		}

		if (agent.collaborators?.length) {
			this.#logger.debug(`Use xpert collaborators:\n ${agent.collaborators.map((_) => _.name)}`)
			for await (const collaborator of agent.collaborators) {
				const agent = await this.queryBus.execute<GetXpertAgentQuery, IXpertAgent>(new GetXpertAgentQuery(collaborator.id,))
				tools.push(createXpertAgentTool(
					this.commandBus,
					this.queryBus,
					{
						xpert: collaborator,
						agent,
						options: {
							rootExecutionId: command.options.rootExecutionId,
							isDraft: false,
							subscriber
						} }))
			}
		}

		// Custom parameters
		agent.parameters?.forEach((parameter) => {
			chatAgentState[parameter.name] = {
				value: (x: any, y: any) => y ?? x,
				default: () => ''
			}
		})

		const thread_id = command.options.thread_id
		const graph = createReactAgent({
			tags: [thread_id],
			state: chatAgentState,
			llm: chatModel,
			checkpointSaver: this.copilotCheckpointSaver,
			tools: new ToolNode<AgentState>(tools, {tags: [thread_id]}),
			sensitiveTools: new ToolNode<AgentState>(sensitiveTools, {tags: [thread_id]}),
			interruptBefore: ['sensitiveTools'],
			messageModifier: async (state) => {
				const systemTemplate = `{{role}}
{{language}}
Current time: ${new Date()}
References documents:
{{context}}
${agent.prompt}
`
				const system = await SystemMessagePromptTemplate.fromTemplate(systemTemplate, {
					templateFormat: 'mustache'
				}).format({ ...state })
				return [new SystemMessage(system), ...state.messages]
			}
		})

		this.#logger.debug(`Start chat with xpert '${xpert.name}' & agent '${agent.title}'`)

		// Record ai model info into execution
		await this.commandBus.execute(
			new XpertAgentExecutionUpsertCommand({
				id: execution.id,
				metadata: {
					provider: copilotModel.copilot.modelProvider?.providerName,
					model: copilotModel.model || copilotModel.copilot.copilotModel?.model
				}
			})
		)

		const config = {
			thread_id,
			checkpoint_ns: '',
		}
		if (message) {
			// Update parameters of the last tool call message
			const aiMessage = mapStoredMessageToChatMessage(message) as AIMessage
			const state = await graph.getState({configurable: config},)
			const messages = state.values.messages
			const lastMessage = messages[messages.length - 1]
			if (lastMessage.id === aiMessage.id) {
				const newMessage = {
					role: "assistant",
					content: lastMessage.content,
					tool_calls: lastMessage.tool_calls.map((toolCall) => {
						const newToolCall = aiMessage.tool_calls.find((_) => _.id === toolCall.id)
						return {...toolCall, args: {...toolCall.args, ...(newToolCall?.args ?? {})} }
					}) ,
					id: lastMessage.id
				}
				await graph.updateState({configurable: config}, { messages: [newMessage]})
			}
		}

		const eventStack: string[] = []
		let toolCalls = null
		let prevEvent = ''
		const contentStream = from(
			graph.streamEvents(
				input.input ? {
					...input,
					messages: [new HumanMessage(input.input)]
				} : null,
				{
					version: 'v2',
					configurable: {
						...config,
						tenantId: tenantId,
						organizationId: organizationId,
						userId: user.id,
						subscriber
					},
					recursionLimit: AgentRecursionLimit,
					signal: abortController.signal
					// debug: true
				},
			)
		).pipe(
			switchMap(async ({ event, tags, data, ...rest }: any) => {
				if (Logger.isLevelEnabled('debug')) {
					if (event === 'on_chat_model_stream') {
						if (prevEvent === 'on_chat_model_stream') {
							process.stdout.write('.')
						} else {
							this.#logger.debug(`on_chat_model_stream [${agentLabel(agent)}]`)
						}
					} else {
						if (prevEvent === 'on_chat_model_stream') {
							process.stdout.write('\n')
						}
						this.#logger.debug(`${event} [${agentLabel(agent)}]`)
					}
				} else {
					this.#logger.verbose(`${event} [${agentLabel(agent)}]`)
				}

				prevEvent = event
				switch (event) {
					case 'on_chain_start': {
						eventStack.push(event)
						break
					}
					case 'on_chain_end': {
						let _event = eventStack.pop()
						if (_event === 'on_tool_start') {
							// 当调用 Tool 报错异常时会跳过 on_tool_end 事件，直接到此事件
							while(_event === 'on_tool_start') {
								_event = eventStack.pop()
							}
							// Clear all error tool calls
							if (toolCalls) {
								Object.keys(toolCalls).filter((id) => !!toolCalls[id]).forEach((id) => {
									subscriber.next({
										data: {
											type: ChatMessageTypeEnum.EVENT,
											event: ChatMessageEventTypeEnum.ON_TOOL_ERROR,
											data: toolCalls[id]
										}
									} as MessageEvent)
								})
								toolCalls = null
							}
						}
						
						// All chains end
						if (_event !== 'on_chain_start') {
							eventStack.pop()
						}
						break
					}
					case 'on_chat_model_start': {
						eventStack.push(event)
						break
					}
					case 'on_chat_model_end': {
						const _event = eventStack.pop()
						if (_event !== 'on_chat_model_start') {
							eventStack.pop()
						}
						return null
					}
					case 'on_chat_model_stream': {
						// Only returns the stream events content of the current react agent (filter by tag: thread_id), not events of agent in tool call.
						if (tags.includes(thread_id)) {
							const msg = data.chunk as AIMessageChunk
							if (!msg.tool_call_chunks?.length) {
								if (msg.content) {
									return msg.content
								}
							}
						}
						break
					}
					
					case 'on_chain_stream': {
						// Only returns the stream events content of the current react agent (filter by tag: thread_id), not events of agent in tool call.
						if (tags.includes(thread_id)) {
							const msg = data.chunk as AIMessageChunk
							if (!msg.tool_call_chunks?.length) {
								if (msg.content) {
									return msg.content
								}
							}
						}
						break
					}
					
					case 'on_tool_start': {
						// this.#logger.verbose(data, rest)
						eventStack.push(event)
						// Tools currently called in parallel
						toolCalls ??= {}
						toolCalls[rest.run_id] = {data, ...rest}
						subscriber.next({
							data: {
								type: ChatMessageTypeEnum.EVENT,
								event: ChatMessageEventTypeEnum.ON_TOOL_START,
								data: {
									data,
									...rest,
								}
							}
						} as MessageEvent)
						break
					}
					case 'on_tool_end': {
						// this.#logger.verbose(data, rest)
						// Clear finished tool call
						if (toolCalls?.[rest.run_id]) {
						  toolCalls[rest.run_id] = null
						}
						const _event = eventStack.pop()
						if (_event !== 'on_tool_start') { // 应该不会出现这种情况吧？
							eventStack.pop()
						}
						subscriber.next({
							data: {
								type: ChatMessageTypeEnum.EVENT,
								event: ChatMessageEventTypeEnum.ON_TOOL_END,
								data: {
									data,
									tags,
									...rest,
								}
							}
						} as MessageEvent)
						break
					}
					case 'on_retriever_start': {
						// this.#logger.verbose(data, rest)
						subscriber.next({
							data: {
								type: ChatMessageTypeEnum.EVENT,
								event: ChatMessageEventTypeEnum.ON_RETRIEVER_START,
								data: {
									data,
									tags,
									...rest,
								}
							}
						} as MessageEvent)
						break
					}
					case 'on_retriever_end': {
						// this.#logger.verbose(data, rest)
						subscriber.next({
							data: {
								type: ChatMessageTypeEnum.EVENT,
								event: ChatMessageEventTypeEnum.ON_RETRIEVER_END,
								data: {
									data,
									tags,
									...rest,
								}
							}
						} as MessageEvent)
						break
					}
					case 'on_custom_event': {
						this.#logger.verbose(data, rest)
						switch(rest.name) {
							case 'on_retriever_error': {
								subscriber.next({
									data: {
										type: ChatMessageTypeEnum.EVENT,
										event: ChatMessageEventTypeEnum.ON_RETRIEVER_ERROR,
										data: {
											tags,
											...rest,
											name: data.knowledgebaseId,
											error: data.error
										}
									}
								} as MessageEvent)
								break
							}
						}
						break
					}
				}
				
				return null
			}),
			tap({
				complete: async () => {
					//
				},
				error: (err) => {
					this.#logger.debug(err)
				},
				finalize: () => {
					//
				}
			})
		)

		return concat(contentStream, of(1).pipe(
			switchMap(async () => {
				const state = await graph.getState({
					configurable: {
						...config,
					}
				})

				if (state.next?.[0]) {
					// console.log(state)
					const messages = state.values.messages
					const lastMessage = messages[messages.length - 1]
					if (isAIMessageChunk(lastMessage)) {
						this.#logger.debug(`Interrupted chat [${agentLabel(agent)}].`)
						throw new NodeInterrupt(`Confirm tool calls`)
					}
				} else {
					this.#logger.debug(`End chat [${agentLabel(agent)}].`)
				}
				return null
			})
		)).pipe(
			filter((content) => !isNil(content)),
		)
	}
}
