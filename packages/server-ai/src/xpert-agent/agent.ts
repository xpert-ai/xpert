import { AIMessage, AIMessageChunk, BaseMessage, isBaseMessage, isToolMessage } from '@langchain/core/messages'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { BaseLLMParams } from '@langchain/core/language_models/llms'
import { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager'
import { ChatGenerationChunk, ChatResult } from '@langchain/core/outputs'
import { CompiledStateGraph, isCommand } from '@langchain/langgraph'
import { agentLabel, ChatMessageEventTypeEnum, ChatMessageStepCategory, ChatMessageTypeEnum, isAgentKey, IXpert, IXpertAgent, TMessageChannel, TMessageComponent, TMessageComponentStep, TMessageContentComponent, TMessageContentReasoning, TMessageContentText, TXpertAgentConfig, TXpertTeamNode} from '@metad/contracts'
import { Logger } from '@nestjs/common'
import { Subscriber } from 'rxjs'
import { instanceToPlain } from 'class-transformer'
import { AgentStateAnnotation } from '../shared'

/**
 * Create an operator function that intercepts Langgraph events, 
 * passes the message content through, and sends other events to client by sse subscriber.
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
		agent?: IXpertAgent;
		unmutes: TXpertAgentConfig['mute']
		xperts?: IXpert[]
	}
) {
	const { agent, unmutes, xperts } = options ?? {}
	// let collectingResult = ''
	const eventStack: string[] = []
	let prevEvent = ''
	const toolsMap: Record<string, string> = {} // For lc_name and name of tool is different
	const processFun = ({ event, tags, data, ...rest }: any) => {
		const langgraph_node = rest.metadata.langgraph_node
		const agentKey = isAgentKey(langgraph_node) && langgraph_node !== agent?.key ? langgraph_node : null
		const xpert = xperts?.find((_) => _.agent?.key === agentKey)

		if (Logger.isLevelEnabled('debug')) {
			if (event === 'on_chat_model_stream') {
				if (prevEvent === 'on_chat_model_stream') {
					process.stdout.write('.')
				} else {
					logger.debug(`on_chat_model_stream [${ agent ? agentLabel(agent) : 'common'}]`)
				}
			} else {
				if (prevEvent === 'on_chat_model_stream') {
					process.stdout.write('\n')
				}
				logger.debug(`${event} [${ agent ? agentLabel(agent) : 'common'}]`)
			}
		} else {
			logger.verbose(`${event} [${ agent ? agentLabel(agent) : 'common'}]`)
		}

		switch (event) {
			case 'on_chain_start': {
				eventStack.push(event)
				break
			}
			case 'on_chain_end': {
				let _event = eventStack.pop()
				if (_event === 'on_tool_start') {
					// 当调用 Tool 报错异常时会跳过 on_tool_end 事件，直接到此事件
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
						return msg.content
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
							const chunk = {
								type: "text",
								text: '',
								id: msg.id,
								created_date: new Date()
							} as TMessageContentText
							if (agentKey) {
								chunk.agentKey = agentKey
							}
							if (rest.metadata.xpertName) {
								chunk.xpertName = rest.metadata.xpertName
							} else if (xpert) {
								chunk.xpertName = xpert.name
							}
							
							if (typeof msg.content === 'string') {
								chunk.text += msg.content
							} else {
								chunk.text += msg.content.map((_) => (_.type === 'text' || _.type === 'text_delta') ? _.text : '').join('')
							}
							return chunk
						}

						// Reasoning content in additional_kwargs
						if (msg.additional_kwargs?.reasoning_content) {
							const chunk = {
								type: "reasoning",
								text: '',
								id: msg.id,
								created_date: new Date()
							} as TMessageContentReasoning
							if (agentKey) {
								chunk.agentKey = agentKey
							}
							if (rest.metadata.xpertName) {
								chunk.xpertName = rest.metadata.xpertName
							} else if (xpert) {
								chunk.xpertName = xpert.name
							}
							
							chunk.text += msg.additional_kwargs.reasoning_content
							return chunk

							// subscriber.next({
							// 	data: {
							// 		type: ChatMessageTypeEnum.MESSAGE,
							// 		data: {
							// 			type: 'reasoning',
							// 			content: msg.additional_kwargs.reasoning_content
							// 		}
							// 	}
							// } as MessageEvent)
						}
					}
				}
				break
			}

			case 'on_chain_stream': {
				if (!isMute(tags, unmutes)) {
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
					// 应该不会出现这种情况吧？
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
				// subscriber.next({
				// 	data: {
				// 		type: ChatMessageTypeEnum.EVENT,
				// 		event: ChatMessageEventTypeEnum.ON_TOOL_END,
				// 		data: {
				// 			data: { ...data, output },
				// 			tags,
				// 			...rest
				// 		}
				// 	}
				// } as MessageEvent)

				const tool_call_id = data.output?.tool_call_id || data.id || rest.metadata.tool_call_id
				if (tool_call_id) {
					const component: any = {
									// category: 'Computer',
									status: 'success',
									end_date: new Date(),
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
								data: data.output,
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
						// subscriber.next({
						// 	data: {
						// 		type: ChatMessageTypeEnum.EVENT,
						// 		event: ChatMessageEventTypeEnum.ON_TOOL_ERROR,
						// 		data: {
						// 			...rest,
						// 			...data,
						// 			name: toolsMap[data.toolCall.name] ?? data.toolCall.name,
						// 			tags
						// 		}
						// 	}
						// } as MessageEvent)

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
										end_date: new Date(),
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
											data: data.data,
										} as TMessageComponent<TMessageComponentStep>
									} as TMessageContentComponent
								}
							} as MessageEvent)
						} else {
							logger.warn(`Unsupported custom_event & tool message category: ${data.category}`, data)
							/**
							 * Others are displayed as execution steps (event) temporarily
							 */
							// subscriber.next({
							// 	data: {
							// 		type: ChatMessageTypeEnum.EVENT,
							// 		event: ChatMessageEventTypeEnum.ON_TOOL_MESSAGE,
							// 		data: {
							// 			tags,
							// 			...rest,
							// 			...data,
							// 			created_date: new Date()
							// 		}
							// 	}
							// } as MessageEvent)
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
		// collectingResult += messageContentText(content)
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
	sleep?: number = 50;
  
	responses?: BaseMessage[];
  
	thrownErrorString?: string;
  
	constructor(
	  fields: {
		sleep?: number;
		responses?: BaseMessage[];
		thrownErrorString?: string;
	  } & BaseLLMParams
	) {
	  super(fields);
	  this.sleep = fields.sleep ?? this.sleep;
	  this.responses = fields.responses;
	  this.thrownErrorString = fields.thrownErrorString;
	}
  
	_llmType() {
	  return "fake";
	}
  
	async _generate(
	  messages: BaseMessage[],
	  _options: this["ParsedCallOptions"],
	  _runManager?: CallbackManagerForLLMRun
	): Promise<ChatResult> {
	  if (this.thrownErrorString) {
		throw new Error(this.thrownErrorString);
	  }
  
	  const content = this.responses?.[0].content ?? messages[0].content;
	  const generation: ChatResult = {
		generations: [
		  {
			text: "",
			message: new AIMessage({
			  content,
			}),
		  },
		],
	  };
  
	  return generation;
	}
  
	async *_streamResponseChunks(
	  messages: BaseMessage[],
	  _options: this["ParsedCallOptions"],
	  _runManager?: CallbackManagerForLLMRun
	): AsyncGenerator<ChatGenerationChunk> {
	  if (this.thrownErrorString) {
		throw new Error(this.thrownErrorString);
	  }
	  const content = this.responses?.[0].content ?? messages[0].content;
	  if (typeof content !== "string") {
		for (const _ of this.responses ?? messages) {
		  yield new ChatGenerationChunk({
			text: "",
			message: new AIMessageChunk({
			  content,
			}),
		  });
		}
	  } else {
		for (const _ of this.responses ?? messages) {
		  yield new ChatGenerationChunk({
			text: content,
			message: new AIMessageChunk({
			  content,
			}),
		  });
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
	agent: IXpertAgent; 
	graph: CompiledStateGraph<unknown, unknown, any, typeof AgentStateAnnotation.spec, typeof AgentStateAnnotation.spec>;
	nextNodes: TXpertTeamNode[];
	failNode: TXpertTeamNode
	mute?: TXpertAgentConfig['mute']
}

export { TAgentSubgraphParams } from '../shared'