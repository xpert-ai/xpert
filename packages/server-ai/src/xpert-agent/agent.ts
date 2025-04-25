import { AIMessage, AIMessageChunk, BaseMessage } from '@langchain/core/messages'
import { BaseChannel, isCommand } from '@langchain/langgraph'
import { BaseLLMParams } from '@langchain/core/language_models/llms'
import { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager'
import { ChatGenerationChunk, ChatResult } from '@langchain/core/outputs'
import { agentLabel, channelName, ChatMessageEventTypeEnum, ChatMessageStepType, ChatMessageTypeEnum, isAgentKey, IXpertAgent, TMessageChannel, TMessageContentText, TStateVariable, TWorkflowVarGroup, TXpertGraph, TXpertTeamNode } from '@metad/contracts'
import { Logger } from '@nestjs/common'
import { Subscriber } from 'rxjs'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { instanceToPlain } from 'class-transformer'
import { AgentStateAnnotation } from './commands/handlers/types'

export function createMapStreamEvents(
	logger: Logger,
	thread_id: string,
	subscriber: Subscriber<MessageEvent>,
	options?: {
		agent?: IXpertAgent;
		disableOutputs?: string[]
	}
) {
	const { agent, disableOutputs } = options ?? {}
	// let collectingResult = ''
	const eventStack: string[] = []
	let prevEvent = ''
	/**
	 * @deprecated	
	 */
	let startStream = false
	const toolsMap: Record<string, string> = {} // For lc_name and name of tool is different
	const processFun = ({ event, tags, data, ...rest }: any) => {
		const langgraph_node = rest.metadata.langgraph_node
		const agentKey = isAgentKey(langgraph_node) && langgraph_node !== agent.key ? langgraph_node : null

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
					if (!disableOutputs?.some((key) => tags.includes(key))) {
						const msg = data.output as AIMessageChunk
						return msg.content
					}
				}
				return null
			}
			case 'on_chat_model_stream': {
				// if (prevEvent !== 'on_chat_model_stream' && collectingResult) {
				// 	startStream = true
				// }
				prevEvent = event

				if (!disableOutputs?.some((key) => tags.includes(key))) {
					const msg = data.chunk as AIMessageChunk
					if (!msg.tool_call_chunks?.length) {
						if (msg.content) {
							// let prefix = ''
							// if (startStream) {
							// 	prefix = '\n\n'
							// 	startStream = false
							// }

							const chunk = {
								type: "text",
								text: '',
								id: msg.id,
								created_date: new Date()
							} as TMessageContentText
							if (agentKey) {
								chunk.agentKey = agentKey
							}
							
							if (typeof msg.content === 'string') {
								chunk.text += msg.content
							} else {
								chunk.text += msg.content.map((_) => (_.type === 'text' || _.type === 'text_delta') ? _.text : '').join('')
							}
							return chunk
						}
						if (msg.additional_kwargs?.reasoning_content) {
							subscriber.next({
								data: {
									type: ChatMessageTypeEnum.MESSAGE,
									data: {
										type: 'reasoning',
										content: msg.additional_kwargs.reasoning_content
									}
								}
							} as MessageEvent)
						}
					}
				}
				break
			}

			case 'on_chain_stream': {
				if (!disableOutputs?.some((key) => tags.includes(key))) {
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
				// Hack out agent key
				const agentKey = rest.metadata.checkpoint_ns?.split(':')[0]
				subscriber.next({
					data: {
						type: ChatMessageTypeEnum.EVENT,
						event: ChatMessageEventTypeEnum.ON_TOOL_START,
						data: {
							data,
							tags,
							...rest,
							agentKey
						}
					}
				} as MessageEvent)
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
				subscriber.next({
					data: {
						type: ChatMessageTypeEnum.EVENT,
						event: ChatMessageEventTypeEnum.ON_TOOL_END,
						data: {
							data: { ...data, output },
							tags,
							...rest
						}
					}
				} as MessageEvent)
				break
			}
			case 'on_retriever_start': {
				// logger.verbose(data, rest)
				subscriber.next({
					data: {
						type: ChatMessageTypeEnum.EVENT,
						event: ChatMessageEventTypeEnum.ON_RETRIEVER_START,
						data: {
							data,
							tags,
							...rest
						}
					}
				} as MessageEvent)
				break
			}
			case 'on_retriever_end': {
				subscriber.next({
					data: {
						type: ChatMessageTypeEnum.EVENT,
						event: ChatMessageEventTypeEnum.ON_RETRIEVER_END,
						data: {
							data,
							tags,
							...rest
						}
					}
				} as MessageEvent)
				break
			}
			case 'on_custom_event': {
				logger.verbose(data, rest)
				switch (rest.name) {
					case ChatMessageEventTypeEnum.ON_TOOL_ERROR: {
						subscriber.next({
							data: {
								type: ChatMessageTypeEnum.EVENT,
								event: ChatMessageEventTypeEnum.ON_TOOL_ERROR,
								data: {
									...rest,
									...data,
									name: toolsMap[data.toolCall.name] ?? data.toolCall.name,
									tags
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
						if (data.type === ChatMessageStepType.Notice) {
							/**
							 * Notification messages from tool calling are displayed in component messages
							 */
							subscriber.next({
								data: {
									type: ChatMessageTypeEnum.MESSAGE,
									data: {
										type: 'component',
										data: {
											type: data.category,
											data: data.data
										}
									}
								}
							} as MessageEvent)
						} else {
							/**
							 * Others are displayed as execution steps (event) temporarily
							 */
							subscriber.next({
								data: {
									type: ChatMessageTypeEnum.EVENT,
									event: ChatMessageEventTypeEnum.ON_TOOL_MESSAGE,
									data: {
										tags,
										...rest,
										...data,
										created_date: new Date()
									}
								}
							} as MessageEvent)
						}
						break
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

export function getAgentVarGroup(key: string, graph: TXpertGraph): TWorkflowVarGroup {
	const agent = graph.nodes.find((_) => _.type === 'agent' && _.key === key) as TXpertTeamNode & {type: 'agent'}

	const variables = []
	const varGroup: TWorkflowVarGroup = {
		agent: {
			title: agent.entity.title,
			description: agent.entity.description,
			name: agent.entity.name || agent.entity.key,
			key: channelName(agent.key)
		},
		group: {
			name: channelName(agent.key),
			description: {
				en_US: agentLabel(agent.entity)
			},
		},
		variables
	}

	variables.push({
		name: `output`,
		type: 'string',
		description: {
			zh_Hans: `输出`,
			en_US: `Output`
		}
	})
	if ((<IXpertAgent>agent.entity).outputVariables) {
		(<IXpertAgent>agent.entity).outputVariables.forEach((variable) => {
			variables.push({
				name: variable.name,
				type: variable.type as TStateVariable['type'],
				description: variable.description
			})
		})
	}

	return varGroup
}

/**
 * Set value into variable of state.
 * 
 * @param state 
 * @param varName 
 * @param value 
 * @returns 
 */
export function setStateVariable(state, varName: string, value: any) {
	const [agentChannelName, variableName] = varName.split('.')
	if (variableName) {
		state[agentChannelName] = {[variableName]: value}
	} else {
		state[agentChannelName] = value
	}

	return state
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

export type TStateChannel = {
	name: string
	annotation: BaseChannel
}

export function getChannelState(state, channel: string): TMessageChannel {
	return channel ? state[channel] : state
}

// Swarm
/**
 * Get swarm partners of agent in team
 * 
 * @param graph 
 * @param agentKey 
 */
export function getSwarmPartners(graph: TXpertGraph, agentKey: string, partners: string[], leaderKey?: string) {
//   console.log(JSON.stringify(graph, null, 2), agentKey)
  const connections = graph.connections.filter((conn) => conn.type === 'agent' && conn.to === agentKey && (leaderKey ? conn.from !== leaderKey : true)
		&& graph.connections.some((_) => _.type === 'agent' && _.to === conn.from && _.from === agentKey))

  connections.forEach((conn) => {
	const key = conn.from
	if (partners.indexOf(key) < 0) {
		partners.push(key)
		getSwarmPartners(graph, key, partners)
	}
  })
  return partners
}
