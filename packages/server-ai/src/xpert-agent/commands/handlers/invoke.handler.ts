import {
	HumanMessage,
	isAIMessage,
	isAIMessageChunk,
	isToolMessage,
	MessageContent,
	ToolMessage
} from '@langchain/core/messages'
import { CompiledStateGraph, NodeInterrupt } from '@langchain/langgraph'
import {
	agentLabel,
	ChatMessageEventTypeEnum,
	ChatMessageTypeEnum,
	IXpertAgent,
	ToolCall,
	TSensitiveOperation
} from '@metad/contracts'
import { AgentRecursionLimit, isNil } from '@metad/copilot'
import { RequestContext } from '@metad/server-core'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { concat, filter, from, Observable, of, switchMap, tap } from 'rxjs'
import { XpertAgentExecutionUpsertCommand } from '../../../xpert-agent-execution/commands'
import { GetXpertAgentQuery } from '../../../xpert/queries'
import { createProcessStreamEvents } from '../../agent'
import { CompleteToolCallsQuery } from '../../queries'
import { XpertAgentInvokeCommand } from '../invoke.command'
import { XpertAgentSubgraphCommand } from '../subgraph.command'
import { STATE_VARIABLE_SYS_LANGUAGE, STATE_VARIABLE_USER_EMAIL, STATE_VARIABLE_USER_TIMEZONE } from './types'
import { GetCopilotCheckpointsByParentQuery } from '../../../copilot-checkpoint/queries'
import { pick } from 'lodash'

@CommandHandler(XpertAgentInvokeCommand)
export class XpertAgentInvokeHandler implements ICommandHandler<XpertAgentInvokeCommand> {
	readonly #logger = new Logger(XpertAgentInvokeHandler.name)

	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: XpertAgentInvokeCommand): Promise<Observable<MessageContent>> {
		const { input, agentKey, xpert, options } = command
		const { execution, subscriber, toolCalls, reject, memories } = options
		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()
		const userId = RequestContext.currentUserId()
		const user = RequestContext.currentUser()

		const abortController = new AbortController()
		// Create graph by command
		const { graph } = await this.commandBus.execute(
			new XpertAgentSubgraphCommand(agentKey, xpert, {
				...options,
				isStart: true,
				abortController
			})
		)

		const agent = await this.queryBus.execute<GetXpertAgentQuery, IXpertAgent>(
			new GetXpertAgentQuery(xpert.id, agentKey, command.options?.isDraft)
		)
		const team = agent.team

		const thread_id = command.options.thread_id
		const config = {
			thread_id
			// checkpoint_ns: '',
		}
		if (reject) {
			await this.reject(graph, config)
		} else if (toolCalls) {
			await this.updateToolCalls(graph, config, toolCalls)
		}

		const contentStream = from(
			graph.streamEvents(
				input?.input
					? {
							...input,
							[STATE_VARIABLE_SYS_LANGUAGE]: options.language || user.preferredLanguage,
							[STATE_VARIABLE_USER_EMAIL]: user.email,
							[STATE_VARIABLE_USER_TIMEZONE]: user.timeZone || options.timeZone,
							memories,
							messages: [new HumanMessage(input.input)],
							[`${agentKey}.messages`]: [new HumanMessage(input.input)]
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
					recursionLimit: team.agentConfig?.recursionLimit ?? AgentRecursionLimit,
					maxConcurrency: team.agentConfig?.maxConcurrency,
					signal: abortController.signal
					// debug: true
				}
			)
		).pipe(
			switchMap(createProcessStreamEvents(this.#logger, thread_id, subscriber, {xpert: team, agent}))
		)

		return concat(
			contentStream,
			of(1).pipe(
				// Then do the final async work after the graph events stream
				switchMap(async () => {
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

					// @todo checkpoint_id The source of the value should be wrong
					execution.checkpointNs =
						state.config?.configurable?.checkpoint_ns ?? checkpoints[0]?.checkpoint_ns
					execution.checkpointId =
						state.config?.configurable?.checkpoint_id ?? checkpoints[0]?.checkpoint_id

					// Update execution title from graph states
					if (state.values.title) {
						execution.title = state.values.title
					}

					const messages = state.values.messages
					const lastMessage = messages[messages.length - 1]
					if (state.next?.[0]) {
						if (isAIMessageChunk(lastMessage)) {
							this.#logger.debug(`Interrupted chat [${agentLabel(agent)}].`)
							const operation = await this.queryBus.execute<CompleteToolCallsQuery, TSensitiveOperation>(
								new CompleteToolCallsQuery(xpert.id, agentKey, lastMessage, options.isDraft)
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
					} else if (isToolMessage(lastMessage)) {
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
						abortController.abort()
					}

					const state = await graph.getState({
						configurable: {
							...config
						}
					})

					await this.commandBus.execute(
						new XpertAgentExecutionUpsertCommand({
							id: execution.id,
							checkpointId: state.parentConfig?.configurable?.checkpoint_id
						})
					)
				}
			})
		)
	}

	async reject(graph: CompiledStateGraph<any, any, any>, config: any) {
		const state = await graph.getState({ configurable: config })
		const messages = state.values.messages
		if (messages) {
			const lastMessage = messages[messages.length - 1]
			if (isAIMessage(lastMessage)) {
				await graph.updateState(
					{ configurable: config },
					{
						messages: lastMessage.tool_calls.map((call) => {
							return new ToolMessage({
								name: call.name,
								content: `Error: Reject by user`,
								tool_call_id: call.id
							})
						})
					},
					'agent'
				)
			}
		}
	}

	async updateToolCalls(graph: CompiledStateGraph<any, any, any>, config: any, toolCalls: ToolCall[]) {
		// Update parameters of the last tool call message
		const state = await graph.getState({ configurable: config })
		const messages = state.values.messages
		const lastMessage = messages[messages.length - 1]
		if (lastMessage.id) {
			const newMessage = {
				role: 'assistant',
				content: lastMessage.content,
				tool_calls: lastMessage.tool_calls.map((toolCall) => {
					const newToolCall = toolCalls.find((_) => _.id === toolCall.id)
					return { ...toolCall, args: { ...toolCall.args, ...(newToolCall?.args ?? {}) } }
				}),
				id: lastMessage.id
			}
			await graph.updateState({ configurable: config }, { messages: [newMessage] }, 'agent')
		}
	}
}
