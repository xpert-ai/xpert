import { HumanMessage, isAIMessage, isToolMessage, MessageContent } from '@langchain/core/messages'
import { RunnableConfig, RunnableLambda } from '@langchain/core/runnables'
import { CompiledStateGraph, isCommand, isParentCommand, NodeInterrupt, START, StateGraph } from '@langchain/langgraph'
import { createSupervisor } from "@langchain/langgraph-supervisor";
import {
	ChatMessageEventTypeEnum,
	ChatMessageTypeEnum,
	IChatConversation,
	IChatMessage,
	IXpert,
	IXpertAgent,
	IXpertAgentExecution,
	IXpertProject,
	TAgentRunnableConfigurable,
	TChatConversationStatus,
	XpertAgentExecutionStatusEnum
} from '@metad/contracts'
import { AgentRecursionLimit, appendMessageContent, isNil } from '@metad/copilot'
import { getErrorMessage } from '@metad/server-common'
import { RequestContext } from '@metad/server-core'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { EnsembleRetriever } from 'langchain/retrievers/ensemble'
import { catchError, concat, EMPTY, filter, from, map, Observable, of, switchMap, tap } from 'rxjs'
import z from 'zod'
import { ChatConversationUpsertCommand } from '../../../chat-conversation'
import { ChatMessageUpsertCommand } from '../../../chat-message'
import { CopilotGetChatQuery } from '../../../copilot'
import { CopilotCheckpointSaver } from '../../../copilot-checkpoint'
import { CopilotModelGetChatModelQuery } from '../../../copilot-model'
import { createKnowledgeRetriever } from '../../../knowledgebase/retriever'
import { CompileGraphCommand, createMapStreamEvents, messageEvent } from '../../../xpert-agent'
import { assignExecutionUsage, XpertAgentExecutionOneQuery, XpertAgentExecutionUpsertCommand } from '../../../xpert-agent-execution'
import { AgentStateAnnotation, stateToParameters } from '../../../xpert-agent/commands/handlers/types'
import { ChatCommonCommand } from '../chat-common.command'
import { SystemMessagePromptTemplate } from '@langchain/core/prompts'
import { XpertProjectService } from '../../../xpert-project/'


@CommandHandler(ChatCommonCommand)
export class ChatCommonHandler implements ICommandHandler<ChatCommonCommand> {
	readonly #logger = new Logger(ChatCommonHandler.name)

	constructor(
		private readonly copilotCheckpointSaver: CopilotCheckpointSaver,
		private readonly projectService: XpertProjectService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: ChatCommonCommand): Promise<Observable<any>> {
		const { tenantId, organizationId, user, knowledgebases } = command.options
		const { conversationId, input, retry } = command.request
		const userId = RequestContext.currentUserId()

		let conversation: IChatConversation = null
		let userMessage: IChatMessage = null
		let aiMessage: IChatMessage = null
		if (isNil(conversationId)) {
			conversation = await this.commandBus.execute(
				new ChatConversationUpsertCommand({
					tenantId,
					organizationId,
					createdById: user.id,
					status: 'busy',
					options: {
						knowledgebases
					}
				})
			)
		} else {
			conversation = await this.commandBus.execute(
				new ChatConversationUpsertCommand(
					{
						id: conversationId,
						status: 'busy',
						error: null
					},
					['messages']
				)
			)
			const lastMessage = conversation.messages[conversation.messages.length - 1]
			if (retry) {
				if (lastMessage?.role === 'ai') {
					aiMessage = lastMessage
				} else if (lastMessage?.role === 'human') {
					userMessage = lastMessage
				}
			}
		}

		// New execution (Run) in thread
		const execution = await this.commandBus.execute<XpertAgentExecutionUpsertCommand, IXpertAgentExecution>(
			new XpertAgentExecutionUpsertCommand({
				inputs: input,
				status: XpertAgentExecutionStatusEnum.RUNNING,
				threadId: conversation.threadId
			})
		)

		if (!userMessage) {
			userMessage = await this.commandBus.execute(
				new ChatMessageUpsertCommand({
					role: 'human',
					content: input.input,
					conversationId: conversation.id
				})
			)
		}

		const tools = []
		// Knowledgebases
		if (knowledgebases?.length) {
			const retrievers = knowledgebases.map((id) => createKnowledgeRetriever(this.queryBus, id))
			const retriever = new EnsembleRetriever({
				retrievers: retrievers,
				weights: retrievers.map(() => 0.5)
			})
			tools.push(
				retriever.asTool({
					name: 'knowledge_retriever',
					description: 'Get information about question.',
					schema: z.string()
				})
			)
		}

		const abortController = new AbortController()
		const executionId = execution.id
		let status = XpertAgentExecutionStatusEnum.SUCCESS
		return new Observable<MessageEvent>((subscriber) => {
			;(async () => {
				subscriber.next({
					data: {
						type: ChatMessageTypeEnum.EVENT,
						event: ChatMessageEventTypeEnum.ON_CONVERSATION_START,
						data: {
							id: conversation.id,
							status: 'busy',
							createdAt: conversation.createdAt,
							updatedAt: conversation.updatedAt
						}
					}
				} as MessageEvent)

				let graph: any = null

				try {
					const thread_id = execution.threadId
					graph = await this.createReactAgent(command, execution, abortController, subscriber)
					// Run
					const config = {
						thread_id,
						checkpoint_ns: ''
					}

					const contentStream = from(
						graph.streamEvents(
							input?.input || retry
								? {
										...(input ?? {}),
										messages: [new HumanMessage(userMessage.content as string)]
									}
								: null,
							{
								version: 'v2',
								configurable: {
									...config,
									tenantId: tenantId,
									organizationId: organizationId,
									userId,
									subscriber
								},
								recursionLimit: AgentRecursionLimit,
								signal: abortController.signal
							}
						)
					).pipe(map(createMapStreamEvents(this.#logger, thread_id, subscriber)))

					const timeStart = Date.now()
					let result = ''
					let error = null
					concat(
						contentStream,
						of(true).pipe(
							switchMap(async () => {
								const state = await graph.getState({
									configurable: {
										...config
									}
								})

								execution.checkpointId = state.parentConfig?.configurable?.checkpoint_id

								// Update execution title from graph states
								if (state.values.title) {
									execution.title = state.values.title
								}

								const messages = state.values.messages
								const lastMessage = messages[messages.length - 1]

								if (isToolMessage(lastMessage)) {
									return lastMessage.content
								}
							})
						)
					)
						.pipe(
							filter((content) => !isNil(content)),
							map((messageContent: MessageContent) => {
								result += messageContent
								return {
									data: {
										type: ChatMessageTypeEnum.MESSAGE,
										data: messageContent
									}
								} as MessageEvent
							}),
							catchError((err) => {
								console.error(err)
								if (err instanceof NodeInterrupt) {
									status = XpertAgentExecutionStatusEnum.INTERRUPTED
									error = null
								} else {
									status = XpertAgentExecutionStatusEnum.ERROR
									error = getErrorMessage(err)
								}
								return EMPTY
							})
						)
						.subscribe({
							next: (message) => {
								subscriber.next(message)
							},
							complete: async () => {
								try {
									const timeEnd = Date.now()

									// Record End time
									await this.commandBus.execute(
										new XpertAgentExecutionUpsertCommand({
											...execution,
											elapsedTime: Number(execution.elapsedTime ?? 0) + (timeEnd - timeStart),
											status,
											error,
											outputs: {
												output: result
											}
										})
									)

									let convStatus: TChatConversationStatus = 'idle'
									if (status === XpertAgentExecutionStatusEnum.ERROR) {
										convStatus = 'error'
									} else if (status === XpertAgentExecutionStatusEnum.INTERRUPTED) {
										convStatus = 'interrupted'
									}
									const _conversation = await this.commandBus.execute(
										new ChatConversationUpsertCommand({
											id: conversation.id,
											status: convStatus,
											title: conversation.title || execution.title,
											error
										})
									)

									subscriber.next({
										data: {
											type: ChatMessageTypeEnum.EVENT,
											event: ChatMessageEventTypeEnum.ON_CONVERSATION_END,
											data: {
												id: _conversation.id,
												title: _conversation.title,
												status: _conversation.status,
												operation: _conversation.operation,
												error: _conversation.error
											}
										}
									} as MessageEvent)
									subscriber.complete()
								} catch (err) {
									this.#logger.warn(err)
									subscriber.error(err)
								}
							}
						})

					if (!aiMessage) {
						aiMessage = await this.commandBus.execute(
							new ChatMessageUpsertCommand({
								role: 'ai',
								content: ``,
								executionId,
								conversationId: conversation.id,
								status: 'thinking'
							})
						)
					}

					subscriber.next({
						data: {
							type: ChatMessageTypeEnum.EVENT,
							event: ChatMessageEventTypeEnum.ON_MESSAGE_START,
							data: { ...aiMessage, status: 'thinking' }
						}
					} as MessageEvent)
				} catch (err) {
					const entity = {
						id: conversation.id,
						status: 'error',
						error: getErrorMessage(err)
					} as Partial<IChatConversation>
					await this.commandBus.execute(new ChatConversationUpsertCommand(entity))
					subscriber.next({
						data: {
							type: ChatMessageTypeEnum.EVENT,
							event: ChatMessageEventTypeEnum.ON_CONVERSATION_END,
							data: entity
						}
					} as MessageEvent)
					subscriber.complete()
				}
			})()
		}).pipe(
			tap({
				next: (event) => {
					if (event.data.type === ChatMessageTypeEnum.MESSAGE) {
						if (aiMessage) {
							appendMessageContent(aiMessage as any, event.data.data)
						}
					}
				},
				finalize: async () => {
					if (aiMessage) {
						try {
							// Update ai message
							aiMessage.status = status
							await this.commandBus.execute(new ChatMessageUpsertCommand(aiMessage))
						} catch (err) {
							this.#logger.error(err)
						}
					}
				}
			})
		)
	}

	async createReactAgent(
		command: ChatCommonCommand,
		execution: IXpertAgentExecution,
		abortController: AbortController,
		subscriber
	) {
		const { projectId } = command.request
		const { tenantId, organizationId } = command.options

		// Project
		let project: IXpertProject
		if (projectId) {
			project = await this.projectService.findOne(projectId, {relations: ['xperts', 'xperts.agent']})
		}

		// Xperts
		console.log(project?.xperts)

		// Find an available copilot
		const copilot = await this.queryBus.execute(new CopilotGetChatQuery(tenantId, organizationId))

		const chatModel = await this.queryBus.execute(
			new CopilotModelGetChatModelQuery(copilot, null, {
				abortController,
				usageCallback: assignExecutionUsage(execution)
			})
		)

		const thread_id = execution.threadId
		const callModel = async (state: typeof AgentStateAnnotation.State, config?: RunnableConfig) => {
			const parameters = stateToParameters(state)
			const systemTemplate = project?.settings?.instruction || ''
			const systemMessage = await SystemMessagePromptTemplate.fromTemplate(systemTemplate, {
				templateFormat: 'mustache'
			}).format(parameters)
			return { messages: [await chatModel.invoke([systemMessage, ...state.messages], config)] }
		}

		let graphBuilder: StateGraph<any, any, any, any>
		// Create Supervisor
		if (project?.xperts.length) {
			const agents = []
			for await (const xpert of project.xperts) {
				const graph = await this.createXpertAgent(xpert, abortController, execution, subscriber)
				agents.push(graph)
			}
			// Create supervisor workflow
			graphBuilder = createSupervisor({
				agents,
				llm: chatModel,
				prompt: 
					"您是一位团队主管，管理以下专家，请安排他们任务以解决用户的问题：" +
					project.xperts.reduce((prompt, xpert) => {
						prompt += `- xpert_${xpert.slug}: ${xpert.description}\n\n`
						return prompt
					}, '')
			});
		} else {
			graphBuilder = new StateGraph(AgentStateAnnotation).addNode(
				'common',
				new RunnableLambda({ func: callModel }).withConfig({ runName: 'common', tags: [thread_id, projectId] })
			)
			.addEdge(START, 'common')
		}

		return graphBuilder.compile({
			checkpointer: this.copilotCheckpointSaver
		})
	}

	async createXpertAgent(xpert: IXpert, abortController: AbortController, execution: IXpertAgentExecution, subscriber) {
		const { graph, agent } = await this.commandBus.execute<
			CompileGraphCommand,
			{ graph: CompiledStateGraph<unknown, unknown>; agent: IXpertAgent }
		>(
			new CompileGraphCommand(xpert.agent.key, xpert, {
				execution,
				rootController: abortController,
				signal: abortController.signal,
				subscriber
			})
		)
		const _execution = {}
		const runnable = new RunnableLambda({
			func: async (state: typeof AgentStateAnnotation.spec, config) => {
				const configurable: TAgentRunnableConfigurable = config.configurable
				const {subscriber} = configurable
				// Record start time
				const timeStart = Date.now()
				const __execution = await this.commandBus.execute(
					new XpertAgentExecutionUpsertCommand({
						..._execution,
						threadId: config.configurable.thread_id,
						checkpointNs: config.configurable.checkpoint_ns,
						xpert: { id: xpert.id } as IXpert,
						agentKey: xpert.agent.key,
						inputs: { input: state.input },
						parentId: execution.id,
						status: XpertAgentExecutionStatusEnum.RUNNING,
						predecessor: configurable.agentKey
					})
				)

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
							checkpointId: _state.config.configurable.checkpoint_id,
							elapsedTime: timeEnd - timeStart,
							status,
							error,
							outputs: {
								output: result
							}
						})
					)

					const fullExecution = await this.queryBus.execute(
						new XpertAgentExecutionOneQuery(___execution.id)
					)

					// End agent execution event
					subscriber.next(messageEvent(ChatMessageEventTypeEnum.ON_AGENT_END, fullExecution))
				}
				try {
					const output = await graph.invoke(state, {...config, configurable: {...config.configurable, agentKey: ''}} )

					const lastMessage = output.messages[output.messages.length - 1]
					if (lastMessage && isAIMessage(lastMessage)) {
						result = lastMessage.content as string
					}

					return output
				} catch (err) {
					if (!isParentCommand(err) && !isCommand(err)) {
						error = getErrorMessage(err)
						status = XpertAgentExecutionStatusEnum.ERROR
					}
					throw err
				} finally {
					// End agent execution event
					await finalize()
				}
			}
		})
		runnable.name = `xpert_` + xpert.slug
		return runnable
	}
}
