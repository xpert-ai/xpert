import { AIMessageChunk } from '@langchain/core/messages'
import { isCommand } from '@langchain/langgraph'
import { agentLabel, ChatMessageEventTypeEnum, ChatMessageTypeEnum, IXpertAgent } from '@metad/contracts'
import { Logger } from '@nestjs/common'
import { Subscriber } from 'rxjs'
import { AgentStateAnnotation } from './commands/handlers/types'

export function createProcessStreamEvents(
	logger: Logger,
	thread_id: string,
	subscriber: Subscriber<MessageEvent>,
	agent?: IXpertAgent
) {
	const eventStack: string[] = []
	let prevEvent = ''
	const toolsMap: Record<string, string> = {} // For lc_name and name of tool is different
	return async ({ event, tags, data, ...rest }: any) => {
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
					if (tags.includes(thread_id)) {
						const msg = data.output as AIMessageChunk
						return msg.content
					}
				}
				return null
			}
			case 'on_chat_model_stream': {
				prevEvent = event
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
				eventStack.push(event)
				toolsMap[rest.metadata.langgraph_node] = rest.name
				subscriber.next({
					data: {
						type: ChatMessageTypeEnum.EVENT,
						event: ChatMessageEventTypeEnum.ON_TOOL_START,
						data: {
							data,
							...rest
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
				}
				break
			}
		}

		prevEvent = event
		return null
	}
}
