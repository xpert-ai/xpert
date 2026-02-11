import {
	isAIMessage,
	MessageContent,
	ToolMessage
} from '@langchain/core/messages'
import { Command, CompiledStateGraph, GraphRecursionError, NodeInterrupt } from '@langchain/langgraph'
import {
	channelName,
	ChatMessageEventTypeEnum,
	ChatMessageTypeEnum,
	IKnowledgebaseTask,
	KnowledgebaseChannel,
	KnowledgeTask,
	LanguagesEnum,
	mapTranslationLanguage,
	STATE_SYS_VOLUME,
	STATE_SYS_WORKSPACE_PATH,
	STATE_SYS_WORKSPACE_URL,
	STATE_VARIABLE_HUMAN,
	STATE_VARIABLE_SYS,
	TSandboxConfigurable,
	TInterruptCommand,
	TXpertAgentConfig,
	XpertAgentExecutionStatusEnum,
	figureOutXpert,
	IXpert
} from '@metad/contracts'
import { AgentRecursionLimit, isNil } from '@metad/copilot'
import { RequestContext } from '@metad/server-core'
import { getErrorMessage, omit } from '@metad/server-common'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { format } from 'date-fns/format'
import { pick } from 'lodash'
import { I18nService } from 'nestjs-i18n'
import { catchError, concat, filter, from, map, Observable, of, switchMap, tap } from 'rxjs'
import { CopilotCheckpointSaver, GetCopilotCheckpointsByParentQuery } from '../../../copilot-checkpoint'
import { XpertAgentExecutionUpsertCommand } from '../../../xpert-agent-execution/commands'
import { createMapStreamEvents } from '../../agent'
import { CompleteToolCallsQuery } from '../../queries'
import { CompileGraphCommand } from '../compile-graph.command'
import { XpertAgentInvokeCommand } from '../invoke.command'
import { EnvironmentService } from '../../../environment'
import { getWorkspace, VolumeClient, ExecutionCancelService } from '../../../shared'
import { KnowledgebaseTaskService, KnowledgeTaskServiceQuery } from '../../../knowledgebase'
import { SandboxService } from '../../../sandbox/sandbox.service'
import { validateXpertParameterValues } from '../../../shared/agent/parameter'

@CommandHandler(XpertAgentInvokeCommand)
export class XpertAgentInvokeHandler implements ICommandHandler<XpertAgentInvokeCommand> {
	readonly #logger = new Logger(XpertAgentInvokeHandler.name)

	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		private readonly checkpointSaver: CopilotCheckpointSaver,
		private readonly envService: EnvironmentService,
		private readonly i18nService: I18nService,
		private readonly executionCancelService: ExecutionCancelService,
		private readonly sandboxService: SandboxService,
	) {}

	public async execute(command: XpertAgentInvokeCommand): Promise<Observable<MessageContent>> {
		const { state, agentKeyOrName, xpert, options } = command
		const { execution, subscriber, reject, memories } = options
		const optionContext = options as {
			user?: any
			tenantId?: string
			organizationId?: string
		}
		const user = RequestContext.currentUser() ?? optionContext.user
		const tenantId = RequestContext.currentTenantId() ?? optionContext.tenantId ?? user?.tenantId
		const organizationId = RequestContext.getOrganizationId() ?? optionContext.organizationId
		const userId = RequestContext.currentUserId() ?? optionContext.user?.id
		const mute = [] as TXpertAgentConfig['mute']
		let unmutes = [] as TXpertAgentConfig['mute']
		const threadId = options.thread_id
		const workspacePath = await VolumeClient.getWorkspacePath(
			tenantId,
			options.projectId,
			userId,
			threadId
		)
		const workspaceUrl = VolumeClient.getWorkspaceUrl(options.projectId, userId, threadId)
		const sessionId = options.conversationId ?? threadId ?? execution?.id
		let sandboxContext: TSandboxConfigurable = null
		const latestXpert = figureOutXpert(xpert as IXpert, options?.isDraft)
		const sandboxFeature = latestXpert.features?.sandbox
		if (sandboxFeature?.enabled) {
			const providerType =
				sandboxFeature.provider ?? this.sandboxService.getDefaultProviderType()
			if (providerType && sessionId) {
				try {
					const backend = await this.sandboxService.getOrCreateBackend({
						sessionId,
						provider: providerType,
						workingDirectory: workspacePath
					})
					sandboxContext = {
						provider: providerType,
						workingDirectory: workspacePath,
						backend
					}
				} catch (err) {
					this.#logger.warn(
						`Sandbox provider "${providerType}" init failed: ${getErrorMessage(err)}`
					)
				}
			}
		}

		// Env
		if (!options.environment && xpert.environmentId) {
			const environment = await this.envService.findOne(xpert.environmentId)
			options.environment = environment
		}

		// Create local AbortController and link it with parent's signal if available
		const abortController = new AbortController()

		// If parent has an abortController, link them so parent abort propagates to child
		if (options.abortController) {
			const parentSignal = options.abortController.signal
			if (parentSignal.aborted) {
				// Already aborted
				abortController.abort(parentSignal.reason)
			} else {
				parentSignal.addEventListener('abort', () => {
					abortController.abort(parentSignal.reason)
				}, { once: true })
			}
		}

		if (execution?.id) {
			this.executionCancelService.register(execution.id, abortController)
		}
		const { graph, agent, xpertGraph } = await this.commandBus.execute(
			new CompileGraphCommand(agentKeyOrName, xpert, {
				...options,
				execution,
				rootController: abortController,
				signal: abortController.signal,
				mute
			})
		)

		let task: IKnowledgebaseTask = null
		if (xpert.knowledgebase) {
			state[KnowledgebaseChannel] ??= {}
			state[KnowledgebaseChannel]['knowledgebaseId'] ??= xpert.knowledgebase.id
			if (!state[KnowledgebaseChannel][KnowledgeTask]) {
				const taskService = await this.queryBus.execute<KnowledgeTaskServiceQuery, KnowledgebaseTaskService>(new KnowledgeTaskServiceQuery())
				task = await taskService.createTask(xpert.knowledgebase.id, {
					taskType: 'ingest',
					conversationId: options.conversationId,
					executionId: execution?.id
				})
				state[KnowledgebaseChannel][KnowledgeTask] = task.id
			}
		}
		
		const team = agent.team

		// Unmutes
		xpertGraph.nodes.filter((n) => n.type === 'agent').forEach((node) => {
			unmutes.push([node.key, team.id])
		})
		if (team.agentConfig?.mute?.length) {
			mute.push(...team.agentConfig.mute)
		}
		// Remove unmutes from mute list
		mute.forEach((m) => {
			unmutes = unmutes.filter((um) => {
				if (m.every((value) => um.includes(value))) {
					return false
				}
				return true
			})
		})

		const thread_id = command.options.thread_id
		const config = {
			thread_id,
			checkpoint_ns: '',
			// Use checkpoint id to resume thread state when retrying
			...(options.checkpointId ? { checkpoint_id: options.checkpointId } : {})
		}

		const recordLastState = async () => {
			// Don't pass checkpoint_id here - we want the LATEST state, not the state
			// from when graph execution started (which would be the retry checkpoint).
			const state = await graph.getState({
				configurable: {
					thread_id: config.thread_id,
					checkpoint_ns: config.checkpoint_ns ?? ''
					// Intentionally omit checkpoint_id to get latest state
				}
			})

			const { checkpoint, pendingWrites } = await this.checkpointSaver.getCopilotCheckpoint(
				state.config ?? state.parentConfig
			)

			// Use checkpoint from saver as primary source (most up-to-date),
			// fallback to state.config for backwards compatibility.
			// pendingWrites takes highest priority if present.
			if (pendingWrites?.length) {
				execution.checkpointNs = pendingWrites[0].checkpoint_ns
				execution.checkpointId = pendingWrites[0].checkpoint_id
			} else if (checkpoint?.checkpoint_id) {
				execution.checkpointNs = checkpoint.checkpoint_ns
				execution.checkpointId = checkpoint.checkpoint_id
			} else {
				execution.checkpointNs = state.config?.configurable?.checkpoint_ns
				execution.checkpointId = state.config?.configurable?.checkpoint_id
			}
			// Update execution title from graph states
			if (state.values.title) {
				execution.title = state.values.title
			}

			return state
		}

		const languageCode = options.language || user?.preferredLanguage || 'en-US'
		let graphInput = null
		if (reject) {
			await this.reject(graph, config, options.command)
		} else if (options.command) {
			if (options.command.toolCalls?.length) {
				await this.updateToolCalls(graph, config, options.command)
			}
			if (options.command.resume) {
				graphInput = new Command(pick(options.command, 'resume', 'update'))
			}
		} else if(state[STATE_VARIABLE_HUMAN]) {
			// English note: Validate human-provided parameter values before building graph input.
			// This prevents oversized strings (max length) from silently passing into runtime.
			validateXpertParameterValues(agent?.parameters, state[STATE_VARIABLE_HUMAN] as any)

			const volumeClient = new VolumeClient({tenantId, catalog: 'users', userId, projectId: options.projectId})
			// const agentChannel = channelName(agent.key)
			// const hasRootMessages = !!state?.messages?.length
			// const hasAgentMessages = !!state?.[agentChannel]?.messages?.length
			// // When resuming from checkpoint (checkpointId exists), don't inject HumanMessage
			// // because the checkpoint already contains the conversation history including HumanMessage.
			// // We only need to re-generate the AI response.
			// const isResumeFromCheckpoint = !!options.checkpointId
			// const shouldInjectHumanMessage = !isResumeFromCheckpoint && !hasRootMessages && !hasAgentMessages && !!state[STATE_VARIABLE_HUMAN]?.input
			// const humanMessage = shouldInjectHumanMessage
			// 	? await createHumanMessage(
			// 			this.commandBus,
			// 			this.queryBus,
			// 			{ [STATE_VARIABLE_HUMAN]: state[STATE_VARIABLE_HUMAN] },
			// 			agent.options?.vision
			// 		)
			// 	: null
			graphInput = {
				...(state ?? {}),
				...omit(state[STATE_VARIABLE_HUMAN], 'input', 'files'),
				/**
				 * @deprecated use `human.input` instead
				 */
				input: state[STATE_VARIABLE_HUMAN].input,
				// // Ensure graph has the real human message for execution logs and prompt input
				// // Skip injecting when resuming from checkpoint to avoid duplicates
				// ...(shouldInjectHumanMessage
				// 	? {
				// 			messages: [humanMessage],
				// 			[agentChannel]: {
				// 				...(state?.[agentChannel] ?? {}),
				// 				messages: [humanMessage]
				// 			}
				// 		}
				// 	: {}),
				[STATE_VARIABLE_SYS]: {
					language: languageCode,
					user_email: user?.email ?? '',
					timezone: user?.timeZone || options.timeZone,
					date: format(new Date(), 'yyyy-MM-dd'),
					datetime: new Date().toLocaleString(),
					[STATE_SYS_VOLUME]: volumeClient.getVolumePath(getWorkspace(options.projectId, options.conversationId)),
					[STATE_SYS_WORKSPACE_PATH]: workspacePath,
					[STATE_SYS_WORKSPACE_URL]: workspaceUrl
				},
				[STATE_VARIABLE_HUMAN]: {
					...state[STATE_VARIABLE_HUMAN],
				},
				memories
			}
		}
		
		const recursionLimit = team.agentConfig?.recursionLimit ?? AgentRecursionLimit
		const contentStream = from(
			graph.streamEvents(graphInput,
				{
					version: 'v2',
					configurable: {
						...config,
						tenantId: tenantId,
						organizationId: organizationId,
						language: languageCode,
						userId,
						executionId: execution.id,
						xpertId: xpert.id,
						agentKey: agent.key, // @todo In swarm mode, it needs to be taken from activeAgent
						sandbox: sandboxContext,
						/**
						 * @deprecated use customEvents instead
						 */
						subscriber
					},
					recursionLimit,
					maxConcurrency: team.agentConfig?.maxConcurrency,
					signal: abortController.signal
					// debug: true
				}
			)
		).pipe(
			map(
				createMapStreamEvents(this.#logger, subscriber, {
					unmutes,
					agent
				})
			),
			catchError((err) =>
				from(
					(async () => {
						// Record last state when exception
						await recordLastState()
						// Translate recursion limit error
						if (err instanceof GraphRecursionError) {
							const recursionLimitReached = await this.i18nService.t(
								'xpert.Error.RecursionLimitReached',
								{
									lang: mapTranslationLanguage(languageCode as LanguagesEnum),
									args: { value: recursionLimit }
								}
							)
							throw new Error(recursionLimitReached)
						}

						throw err
					})()
				)
			)
		)

		return concat(
			contentStream,
			of(1).pipe(
				// Then do the final async work after the graph events stream
				switchMap(async () => {
					// record last state when finish
					const state = await recordLastState()

					// Interrupted event
					if (state.tasks?.length) {
						const operation = await this.queryBus.execute(
								new CompleteToolCallsQuery(xpert.id, state.tasks, state.values, options.isDraft)
							)
						subscriber.next({
							data: {
								type: ChatMessageTypeEnum.EVENT,
								event: ChatMessageEventTypeEnum.ON_INTERRUPT,
								data: operation
							}
						} as MessageEvent)
						throw new NodeInterrupt(`Confirm tool calls`)
					}
					return null
				})
			)
		).pipe(
			filter((content) => !isNil(content)),
			tap({
				/**
				 * This function is triggered when the stream is unsubscribed
				 */
				unsubscribe: async () => {
					this.#logger.debug(`Canceled by client!`)
					if (!abortController.signal.aborted) {
						try {
							abortController.abort()
						} catch (err) {
							//
						}
					}

					try {
						const state = await graph.getState({
							configurable: {
								...config
							}
						})
						const checkpoints = await this.queryBus.execute(
							new GetCopilotCheckpointsByParentQuery(
								pick(state.parentConfig?.configurable, 'thread_id', 'checkpoint_ns', 'checkpoint_id')
							)
						)

						await this.commandBus.execute(
							new XpertAgentExecutionUpsertCommand({
								id: execution.id,
								checkpointId:
									state.config?.configurable?.checkpoint_id ?? checkpoints[0]?.checkpoint_id,
								status: XpertAgentExecutionStatusEnum.ERROR,
								error: 'Aborted!'
							})
						)
					} catch (err) {
						//
					}
				},
				finalize: () => {
					// For cleanup toolset...
					abortController.abort()
					if (execution?.id) {
						this.executionCancelService.unregister(execution.id)
					}
				}
			})
		)
	}

	/**
	 * @deprecated use `rejectGraph` instead
	 * @param graph 
	 * @param config 
	 * @param command 
	 */
	async reject(graph: CompiledStateGraph<any, any, any>, config: any, command: TInterruptCommand) {
		const state = await graph.getState({ configurable: config })
		const channel = channelName(command.agentKey)
		const messages = state.values[channel].messages
		if (messages) {
			const lastMessage = messages[messages.length - 1]
			if (isAIMessage(lastMessage)) {
				await graph.updateState(
					{ configurable: config },
					{
						[channel]: {
							messages: lastMessage.tool_calls.map((call) => {
								return new ToolMessage({
									name: call.name,
									content: `Error: Reject by user`,
									tool_call_id: call.id
								})
							})
						}
					},
					command.agentKey
				)
			}
		}
	}

	/**
	 * @deprecated use `updateToolCalls` instead
	 * @param graph 
	 * @param config 
	 * @param command 
	 */
	async updateToolCalls(graph: CompiledStateGraph<any, any, any>, config: any, command: TInterruptCommand) {
		// Update parameters of the last tool call message
		const state = await graph.getState({ configurable: config })
		const channel = channelName(command.agentKey)
		const messages = state.values[channel].messages
		const lastMessage = messages[messages.length - 1]
		if (lastMessage.id) {
			const newMessage = {
				role: 'assistant',
				content: lastMessage.content,
				tool_calls: lastMessage.tool_calls.map((toolCall) => {
					const newToolCall = command.toolCalls.find((call) => call.id === toolCall.id)
					return { ...toolCall, args: { ...toolCall.args, ...(newToolCall?.args ?? {}) } }
				}),
				id: lastMessage.id
			}
			await graph.updateState(
				{ configurable: config },
				{ [channel]: { messages: [newMessage] } },
				command.agentKey
			)
		}
	}
}
