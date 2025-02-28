import {
	isAIMessage,
	isAIMessageChunk,
	isBaseMessage,
	isBaseMessageChunk,
	isToolMessage,
	MessageContent,
	ToolMessage
} from '@langchain/core/messages'
import { CompiledStateGraph, NodeInterrupt } from '@langchain/langgraph'
import {
	agentLabel,
	channelName,
	ChatMessageEventTypeEnum,
	ChatMessageTypeEnum,
	IXpertAgent,
	TSensitiveOperation,
	XpertAgentExecutionStatusEnum
} from '@metad/contracts'
import { AgentRecursionLimit, isNil } from '@metad/copilot'
import { RequestContext } from '@metad/server-core'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { pick } from 'lodash'
import { catchError, concat, filter, from, Observable, of, switchMap, tap } from 'rxjs'
import { XpertAgentExecutionUpsertCommand } from '../../../xpert-agent-execution/commands'
import { createProcessStreamEvents } from '../../agent'
import { CompleteToolCallsQuery } from '../../queries'
import { XpertAgentInvokeCommand } from '../invoke.command'
import { XpertAgentSubgraphCommand } from '../subgraph.command'
import { STATE_VARIABLE_SYS } from './types'
import { XpertSensitiveOperationException } from '../../../core/errors'
import { format } from 'date-fns/format'
import { CopilotCheckpointSaver, GetCopilotCheckpointsByParentQuery } from '../../../copilot-checkpoint'

@CommandHandler(XpertAgentInvokeCommand)
export class XpertAgentInvokeHandler implements ICommandHandler<XpertAgentInvokeCommand> {
	readonly #logger = new Logger(XpertAgentInvokeHandler.name)

	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		private readonly checkpointSaver: CopilotCheckpointSaver,
	) {}

	public async execute(command: XpertAgentInvokeCommand): Promise<Observable<MessageContent>> {
		const { input, agentKeyOrName, xpert, options } = command
		const { execution, subscriber, operation, reject, memories } = options
		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()
		const userId = RequestContext.currentUserId()
		const user = RequestContext.currentUser()

		const abortController = new AbortController()
		// Create graph by command
		const { agent, graph } = await this.commandBus.execute<XpertAgentSubgraphCommand, {agent: IXpertAgent; graph: CompiledStateGraph<any, any, any>}>(
			new XpertAgentSubgraphCommand(agentKeyOrName, xpert, {
				...options,
				isStart: true,
				rootController: abortController,
				signal: abortController.signal
			})
		)
	
		const team = agent.team

		const thread_id = command.options.thread_id
		const config = {
			thread_id,
			checkpoint_ns: '',
		}
		if (reject) {
			await this.reject(graph, config, operation)
		} else if (operation?.toolCalls) {
			await this.updateToolCalls(graph, config, operation)
		}
		const languageCode = options.language || user.preferredLanguage || 'en-US'

		const recordLastState = async () => {
			const state = await graph.getState({
				configurable: {
					...config
				}
			})

			const {checkpoint, pendingWrites} = await this.checkpointSaver.getCopilotCheckpoint(state.config ?? state.parentConfig)

			// const checkpoints = await this.queryBus.execute(new GetCopilotCheckpointsByParentQuery(pick(
			// 	state.parentConfig?.configurable,
			// 	'thread_id',
			// 	'checkpoint_ns',
			// 	'checkpoint_id'
			// )))

			// @todo checkpoint_id The source of the value should be wrong
			execution.checkpointNs =
				state.config?.configurable?.checkpoint_ns ?? checkpoint?.checkpoint_ns
			execution.checkpointId =
				state.config?.configurable?.checkpoint_id ?? checkpoint?.checkpoint_id

			if (pendingWrites?.length) {
				execution.checkpointNs = pendingWrites[0].checkpoint_ns
				execution.checkpointId = pendingWrites[0].checkpoint_id
			}
			// Update execution title from graph states
			if (state.values.title) {
				execution.title = state.values.title
			}

			return state
		}

		const contentStream = from(
			graph.streamEvents(
				input?.input
					? {
						...input,
						[STATE_VARIABLE_SYS]: {
							language: languageCode,
							user_email: user.email,
							timezone: user.timeZone || options.timeZone,
							date: format(new Date(), 'yyyy-MM-dd'),
							datetime: new Date().toLocaleString()
						},
						memories,
					}
					: null,
				{
					version: 'v2',
					configurable: {
						...config,
						tenantId: tenantId,
						organizationId: organizationId,
						language: languageCode,
						userId,
						subscriber
					},
					recursionLimit: team.agentConfig?.recursionLimit ?? AgentRecursionLimit,
					maxConcurrency: team.agentConfig?.maxConcurrency,
					signal: abortController.signal
					// debug: true
				}
			)
		).pipe(
			switchMap(createProcessStreamEvents(this.#logger, thread_id, subscriber, {
				disableOutputs: [...(team.agentConfig?.disableOutputs ?? []), 'title_conversation', 'summarize_conversation'],
				agent
			})),
			// record last state when exception
			catchError((err) => from(recordLastState()).pipe(
				tap(() => {throw err})
			))
		)

		return concat(
			contentStream,
			of(1).pipe(
				// Then do the final async work after the graph events stream
				switchMap(async () => {
					// record last state when finish
					const state = await recordLastState()

					const messages = state.values.messages
					const lastMessage = messages[messages.length - 1]
					if (state.next?.[0]) {
						const nextAgents = state.next.filter((_) => _ !== 'title_conversation')
												.map((key) => state.values[channelName(key)]?.agent)
												.filter((_) => !!_)
						if (isBaseMessageChunk(lastMessage) && isAIMessageChunk(lastMessage)) {
							this.#logger.debug(`Interrupted chat [${agentLabel(agent)}].`)
							const operation = await this.queryBus.execute<CompleteToolCallsQuery, TSensitiveOperation>(
								new CompleteToolCallsQuery(xpert.id, agent.key, lastMessage, options.isDraft)
							)
							subscriber.next({
								data: {
									type: ChatMessageTypeEnum.EVENT,
									event: ChatMessageEventTypeEnum.ON_INTERRUPT,
									data: {...operation, nextAgents}
								}
							} as MessageEvent)
							throw new NodeInterrupt(`Confirm tool calls`)
						}
					} else if (isBaseMessage(lastMessage) && isToolMessage(lastMessage)) {
						// return lastMessage.content
					} else {
						this.#logger.debug(`End chat [${agentLabel(agent)}].`)
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
						} catch(err) {
							//
						}
					}
					
					try {
						const state = await graph.getState({
							configurable: {
								...config
							}
						})
						const checkpoints = await this.queryBus.execute(new GetCopilotCheckpointsByParentQuery(pick(
							state.parentConfig?.configurable,
							'thread_id',
							'checkpoint_ns',
							'checkpoint_id'
						)))
	
						await this.commandBus.execute(
							new XpertAgentExecutionUpsertCommand({
								id: execution.id,
								checkpointId: state.config?.configurable?.checkpoint_id ?? checkpoints[0]?.checkpoint_id,
								status: XpertAgentExecutionStatusEnum.ERROR,
								error: 'Aborted!',
							})
						)
					} catch(err) {
						//
					}
				}
			})
		)
	}

	async reject(graph: CompiledStateGraph<any, any, any>, config: any, operation: TSensitiveOperation) {
		const state = await graph.getState({ configurable: config })
		if (!operation?.agent) {
			throw new XpertSensitiveOperationException(`Can't found Agent for operation '${operation.messageId}'`)
		}
		const channel = channelName(operation.agent.key)
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
					operation.agent.key
				)
			}
		}
	}

	async updateToolCalls(graph: CompiledStateGraph<any, any, any>, config: any, operation: TSensitiveOperation) {
		// Update parameters of the last tool call message
		const state = await graph.getState({ configurable: config })
		if (!operation?.agent) {
			throw new XpertSensitiveOperationException(`Can't found Agent for operation '${operation.messageId}'`)
		}
		const channel = channelName(operation.agent.key)
		const messages = state.values[channel].messages
		const lastMessage = messages[messages.length - 1]
		if (lastMessage.id) {
			const newMessage = {
				role: 'assistant',
				content: lastMessage.content,
				tool_calls: lastMessage.tool_calls.map((toolCall) => {
					const newToolCall = operation.toolCalls.find(({call}) => call.id === toolCall.id)
					return { ...toolCall, args: { ...toolCall.args, ...(newToolCall?.call.args ?? {}) } }
				}),
				id: lastMessage.id
			}
			await graph.updateState({ configurable: config }, { [channel]: { messages: [newMessage] }}, operation.agent.key)
		}
	}
}
