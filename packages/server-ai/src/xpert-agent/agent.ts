import { AIMessage, AIMessageChunk, BaseMessage, isBaseMessage, isToolMessage } from '@langchain/core/messages'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { BaseLLMParams } from '@langchain/core/language_models/llms'
import { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager'
import { ChatGenerationChunk, ChatResult } from '@langchain/core/outputs'
import { CompiledStateGraph, isCommand } from '@langchain/langgraph'
import {
	agentLabel,
	ChatMessageEventTypeEnum,
	ChatMessageStepCategory,
	ChatMessageTypeEnum,
	isAgentKey,
	IXpert,
	IXpertAgent,
	TMessageChannel,
	TMessageComponent,
	TMessageComponentStep,
	TMessageContentComponent,
	TMessageContentReasoning,
	TXpertAgentConfig,
	TXpertTeamNode
} from '@metad/contracts'
import { Logger } from '@nestjs/common'
import { Subscriber } from 'rxjs'
import { instanceToPlain } from 'class-transformer'
import { AgentStateAnnotation, createTextChunk } from '../shared'

/**
 * Create an operator function that intercepts Langgraph events,
 * passes the message content through, and sends other events to client by sse subscriber.
 *
 * `metadata.internal` usage:
 * - Upstream runnables can mark an event or node with `metadata.internal = true`.
 * - Internal events are treated as server-only signals and are not forwarded to client streams.
 *
 * @param logger
 * @param subscriber
 * @param options
 * @returns
 */
export function createMapStreamEvents(
	logger: Logger,
	subscriber: Subscriber<MessageEvent>,
	options?: {
		agent?: IXpertAgent
		unmutes: TXpertAgentConfig['mute']
		xperts?: IXpert[]
	}
) {
	const { agent, unmutes, xperts } = options ?? {}
	const eventStack: string[] = []
	let prevEvent = ''
	const toolsMap: Record<string, string> = {} // For lc_name and name of tool is different

	const processFun = ({ event, tags, data, ...rest }: any) => {
		const metadata = rest?.metadata ?? {}
		if (metadata.internal === true) {
			return null
		}
		const langgraph_node = metadata.langgraph_node
		const agentKey = isAgentKey(langgraph_node) && langgraph_node !== agent?.key ? langgraph_node : null
		const xpert = xperts?.find((_) => _.agent?.key === agentKey)
		const xpertName = metadata.xpertName || xpert?.name

		if (Logger.isLevelEnabled('debug')) {
			if (event === 'on_chat_model_stream') {
				if (prevEvent === 'on_chat_model_stream') {
					process.stdout.write('.')
				} else {
					logger.debug(`on_chat_model_stream [${agent ? agentLabel(agent) : 'common'}]`)
				}
			} else {
				if (prevEvent === 'on_chat_model_stream') {
					process.stdout.write('\n')
				}
				logger.debug(`${event} [${agent ? agentLabel(agent) : 'common'}]`)
			}
		} else {
			logger.verbose(`${event} [${agent ? agentLabel(agent) : 'common'}]`)
		}

		switch (event) {
			case 'on_chain_start': {
				eventStack.push(event)
				break
			}
			case 'on_chain_end': {
				let _event = eventStack.pop()
				if (_event === 'on_tool_start') {
					// When an error occurs during the Tool call, the on_tool_end event is skipped, and the call proceeds directly to this event.
					while (_event === 'on_tool_start') {
						_event = eventStack.pop()
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
				if (prevEvent !== 'on_chat_model_stream') {
					if (!isMute(tags, unmutes)) {
						const msg = data.output as AIMessageChunk
						return createTextChunk(msg?.content ?? '', {
							streamId: msg?.id || rest?.run_id,
							agentKey,
							xpertName
						})
					}
				}
				return null
			}
			case 'on_chat_model_stream': {
				prevEvent = event

				if (!isMute(tags, unmutes)) {
					const msg = data.chunk as AIMessageChunk
					if (!msg.tool_call_chunks?.length) {
						if (msg.content) {
							return createTextChunk(msg.content, {
								streamId: msg.id || rest?.run_id,
								agentKey,
								xpertName
							})
						}

						// Reasoning content in additional_kwargs
						if (msg.additional_kwargs?.reasoning_content) {
							const chunk = {
								type: 'reasoning',
								text: '',
								id: msg.id || rest?.run_id,
								created_date: new Date()
							} as TMessageContentReasoning
							if (agentKey) {
								chunk.agentKey = agentKey
							}
							if (xpertName) {
								chunk.xpertName = xpertName
							}

							chunk.text += msg.additional_kwargs.reasoning_content
							return chunk
						}
					}
				}
				break
			}

			case 'on_chain_stream': {
				if (!isMute(tags, unmutes)) {
					const chunk = data?.chunk as unknown

					if (typeof chunk === 'string') {
						return createTextChunk(chunk, {
							streamId: rest?.run_id,
							agentKey,
							xpertName
						})
					}

					if (!chunk || typeof chunk !== 'object') {
						break
					}

					const message = chunk as {
						id?: string
						content?: unknown
						tool_call_chunks?: unknown[]
					}

					if (Array.isArray(message.tool_call_chunks) && message.tool_call_chunks.length) {
						break
					}

					if (typeof message.content === 'string' || Array.isArray(message.content)) {
						return createTextChunk(message.content, {
							streamId: message.id ?? rest?.run_id,
							agentKey,
							xpertName
						})
					}
				}
				break
			}

			case 'on_tool_start': {
				eventStack.push(event)
				toolsMap[rest.metadata.langgraph_node] = rest.name

				const tool_call_id = data.id || rest.metadata.tool_call_id
				if (tool_call_id) {
					let input = data.input
					if (data.input && typeof data.input.input === 'string') {
						try {
							input = JSON.parse(data.input.input)
						} catch (error) {
							//
						}
					}
					subscriber.next({
						data: {
							type: ChatMessageTypeEnum.MESSAGE,
							data: {
								id: tool_call_id,
								type: 'component',
								xpertName: rest.metadata.xpertName,
								agentKey: rest.metadata.agentKey,
								data: {
									...data,
									category: 'Tool',
									toolset: rest.metadata.toolset,
									toolset_id: rest.metadata.toolsetId,
									tool: rest.name,
									title: rest.metadata.toolName || rest.metadata[rest.name] || rest.name,
									created_date: new Date(),
									status: 'running',
									input
								} as TMessageComponent<TMessageComponentStep>
							} as TMessageContentComponent
						}
					} as MessageEvent)
				}
				break
			}
			case 'on_tool_end': {
				// logger.verbose(data, rest)
				const _event = eventStack.pop()
				if (_event !== 'on_tool_start') {
					// That shouldn't happen, right?
					eventStack.pop()
				}

				let output = data.output
				if (isCommand(output)) {
					const messages = (<typeof AgentStateAnnotation.State>output.update)?.messages
					if (Array.isArray(messages)) {
						const toolMessage = messages[messages.length - 1]
						output = toolMessage
					}
				}

				const tool_call_id = data.output?.tool_call_id || data.id || rest.metadata.tool_call_id
				if (tool_call_id) {
					const component: any = {
						// category: 'Computer',
						status: 'success',
						end_date: new Date()
					}
					if (isBaseMessage(output) && isToolMessage(output)) {
						if (output.content) {
							component.output = output.content
						}
						if (output.artifact) {
							component.artifact = output.artifact
						}
					}
					subscriber.next({
						data: {
							type: ChatMessageTypeEnum.MESSAGE,
							data: {
								id: tool_call_id,
								type: 'component',
								data: component as TMessageComponent<TMessageComponentStep>
							}
						}
					} as MessageEvent)
				}
				break
			}
			case 'on_retriever_start': {
				// console.log('on_retriever_start', data, rest)
				subscriber.next({
					data: {
						type: ChatMessageTypeEnum.MESSAGE,
						data: {
							id: data.id || rest.metadata.tool_call_id || rest.run_id,
							type: 'component',
							xpertName: rest.metadata.xpertName,
							agentKey: rest.metadata.agentKey,
							data: {
								category: 'Tool',
								type: ChatMessageStepCategory.Knowledges,
								toolset: rest.metadata.toolset,
								toolset_id: rest.metadata.toolsetId,
								title: rest.metadata.toolName || rest.metadata[rest.name] || rest.name,
								created_date: new Date(),
								status: 'running',
								message: data.input?.query,
								end_date: null,
								input: data.input
							} as TMessageComponent<TMessageComponentStep>
						} as TMessageContentComponent
					}
				} as MessageEvent)
				break
			}
			case 'on_retriever_end': {
				subscriber.next({
					data: {
						type: ChatMessageTypeEnum.MESSAGE,
						data: {
							id: data.id || rest.metadata.tool_call_id || rest.run_id,
							type: 'component',
							data: {
								category: 'Computer',
								end_date: new Date(),
								status: 'success',
								data: data.output
							} as Partial<TMessageComponent<TMessageComponentStep>>
						} as TMessageContentComponent
					}
				} as MessageEvent)
				break
			}
			case 'on_custom_event': {
				// logger.verbose(data, rest)
				switch (rest.name) {
					case ChatMessageEventTypeEnum.ON_TOOL_ERROR: {
						subscriber.next({
							data: {
								type: ChatMessageTypeEnum.MESSAGE,
								data: {
									id: data.id || data.toolCall.id || rest.run_id,
									type: 'component',
									data: {
										...data,
										toolset: rest.metadata.toolset,
										toolset_id: rest.metadata.toolsetId,
										tool: data.toolCall?.name,
										status: 'fail',
										end_date: new Date()
									} as TMessageComponent<TMessageComponentStep>
								}
							}
						} as MessageEvent)
						break
					}
					case ChatMessageEventTypeEnum.ON_RETRIEVER_ERROR: {
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
					case ChatMessageEventTypeEnum.ON_TOOL_MESSAGE: {
						if (data.category === 'Computer' || data.category === 'Tool' || data.category === 'Dashboard') {
							/**
							 * Tool messages from tool calling are displayed in component messages
							 */
							subscriber.next({
								data: {
									type: ChatMessageTypeEnum.MESSAGE,
									data: {
										id: data.id || rest.run_id,
										type: 'component',
										data: {
											...data,
											category: data.category,
											type: data.type,
											data: data.data
										} as TMessageComponent<TMessageComponentStep>
									} as TMessageContentComponent
								}
							} as MessageEvent)
						} else {
							logger.warn(`Unsupported custom_event & tool message category: ${data.category}`, data)
						}
						break
					}
					case ChatMessageEventTypeEnum.ON_CHAT_EVENT: {
						// logger.debug(`on_chat_event`, data)
						subscriber.next({
							data: {
								type: ChatMessageTypeEnum.EVENT,
								event: ChatMessageEventTypeEnum.ON_CHAT_EVENT,
								data: {
									tags,
									...rest,
									...data,
									created_date: new Date()
								}
							}
						} as MessageEvent)
					}
				}
				break
			}
		}

		prevEvent = event
		return null
	}

	return (event) => {
		const content = processFun(event)
		return content
	}
}

/**
 * Nodes without tags will default to unmute output. If you want to mute certain nodes, please add tags.
 *
 * @param tags Tags of graph node
 * @param unmutes List of unmute tag groups
 * @returns Is mute
 */
function isMute(tags: string[], unmutes: TXpertAgentConfig['mute']) {
	if (!tags.length || unmutes.some((_) => _.every((tag) => tags.includes(tag)))) {
		return false
	}

	return true
}

export class FakeStreamingChatModel extends BaseChatModel {
	sleep?: number = 50

	responses?: BaseMessage[]

	thrownErrorString?: string

	constructor(
		fields: {
			sleep?: number
			responses?: BaseMessage[]
			thrownErrorString?: string
		} & BaseLLMParams
	) {
		super(fields)
		this.sleep = fields.sleep ?? this.sleep
		this.responses = fields.responses
		this.thrownErrorString = fields.thrownErrorString
	}

	_llmType() {
		return 'fake'
	}

	async _generate(
		messages: BaseMessage[],
		_options: this['ParsedCallOptions'],
		_runManager?: CallbackManagerForLLMRun
	): Promise<ChatResult> {
		if (this.thrownErrorString) {
			throw new Error(this.thrownErrorString)
		}

		const response = this.responses?.[0] ?? messages[0]
		const content = response?.content
		const responseId = response?.id
		const generation: ChatResult = {
			generations: [
				{
					text: '',
					message: new AIMessage({
						id: responseId,
						content
					})
				}
			]
		}

		return generation
	}

	async *_streamResponseChunks(
		messages: BaseMessage[],
		_options: this['ParsedCallOptions'],
		_runManager?: CallbackManagerForLLMRun
	): AsyncGenerator<ChatGenerationChunk> {
		if (this.thrownErrorString) {
			throw new Error(this.thrownErrorString)
		}
		for (const response of this.responses ?? messages) {
			const content = response.content
			const responseId = response.id
			if (typeof content !== 'string') {
				yield new ChatGenerationChunk({
					text: '',
					message: new AIMessageChunk({
						id: responseId,
						content
					})
				})
			} else {
				yield new ChatGenerationChunk({
					text: content,
					message: new AIMessageChunk({
						id: responseId,
						content
					})
				})
			}
		}
	}
}

export function messageEvent(event: ChatMessageEventTypeEnum, data: any) {
	return {
		data: {
			type: ChatMessageTypeEnum.EVENT,
			event,
			data: instanceToPlain(data)
		}
	} as MessageEvent
}

export function getChannelState(state, channel: string): TMessageChannel {
	return channel ? state[channel] : state
}

export type TAgentSubgraphResult = {
	agent: IXpertAgent
	graph: CompiledStateGraph<unknown, unknown, any, typeof AgentStateAnnotation.spec, typeof AgentStateAnnotation.spec>
	nextNodes: TXpertTeamNode[]
	failNode: TXpertTeamNode
	mute?: TXpertAgentConfig['mute']
}

export { TAgentSubgraphParams } from '../shared'
