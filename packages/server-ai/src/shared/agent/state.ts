import { BaseMessage, isAIMessage, isAIMessageChunk, isBaseMessageChunk, ToolMessage, getBufferString } from '@langchain/core/messages'
import { Annotation, CompiledStateGraph, messagesStateReducer, BaseChannel } from '@langchain/langgraph'
import { BaseStore, SearchItem } from '@langchain/langgraph-checkpoint'
import {
	channelName,
	IEnvironment,
	STATE_VARIABLE_HUMAN,
	STATE_VARIABLE_SYS,
	STATE_VARIABLE_TITLE_CHANNEL,
	TChatRequestHuman,
	TInterruptCommand,
	TMessageChannel,
	TStateVariable,
	TToolCall,
	TXpertAgentConfig,
	TXpertTeamNode,
	VariableOperationEnum,
	XpertParameterTypeEnum
} from '@metad/contracts'
import { isFunction } from '@metad/server-common'
import { Subscriber } from 'rxjs'
import { StructuredToolInterface } from '@langchain/core/tools'
import { Runnable, RunnableToolLike } from '@langchain/core/runnables'
import { commonTimes } from './time'

export type TAgentStateSystem = {
	language: string
	user_email: string
	timezone: string
	date: string
	datetime: string
	common_times: string
}

export type TStateChannel = {
	name: string
	annotation: BaseChannel
}

export const AgentStateAnnotation = Annotation.Root({
	messages: Annotation<BaseMessage[]>({
		reducer: messagesStateReducer,
		default: () => []
	}),
	input: Annotation<string>({
		reducer: (a, b) => b ?? a,
		default: () => ''
	}),
	[STATE_VARIABLE_SYS]: Annotation<TAgentStateSystem>({
		reducer: (a, b) => {
			return b
				? {
						...a,
						...b
					}
				: a
		},
		default: () =>
			({
				common_times: commonTimes()
			}) as TAgentStateSystem
	}),
	[STATE_VARIABLE_HUMAN]: Annotation<TChatRequestHuman>({
		reducer: (a, b) => {
			return b ?? a
		},
		default: () => ({} as TChatRequestHuman)
	}),
	/**
	 * Temporarily transfer tool call information between nodes
	 */
	toolCall: Annotation<TToolCall>({
		reducer: (a, b) => b ?? a,
		default: () => null
	}),
	/**
	 * The short title of conversation
	 */
	title: Annotation<string>({
		reducer: (a, b) => b ?? a,
		default: () => null
	}),
	[STATE_VARIABLE_TITLE_CHANNEL]: Annotation<TMessageChannel & Record<string, unknown>>({
		reducer: (a, b) => {
			return b
				? {
						...a,
						...b,
						messages: b.messages ? messagesStateReducer(a.messages, b.messages) : a.messages
					}
				: a
		},
		default: () => ({ system: '', messages: [] })
	}),
	/**
	 * Summarizing past conversations if it's too long
	 */
	summary: Annotation<string>({
		reducer: (a, b) => b ?? a,
		default: () => null
	}),
	/**
	 * Long term memory retrieved
	 */
	memories: Annotation<SearchItem[]>({
		reducer: (a, b) => b ?? a,
		default: () => null
	})
})


export function stateWithEnvironment(state: typeof AgentStateAnnotation.State, environment?: IEnvironment) {
	const initValue: Record<string, any> = {}
	if (environment?.variables) {
		initValue.env = environment.variables.reduce((state, variable) => {
			state[variable.name] = variable.value
			return state
		}, {})
	}
	return {
		...state,
		...initValue,
	}
}

/**
 * Convert agent state with environment to parameters for prompt.
 * 
 * - `getBufferString` for message list.
 * - Convert other state variables to string or JSON.
 *
 * @param state
 * @param environment
 * @returns
 */
export function stateToParameters(state: typeof AgentStateAnnotation.State, environment?: IEnvironment) {
	return {
		...stateWithEnvironment(state, environment),
		...Object.keys(state).reduce((acc, key) => {
			const value = state[key]
			if (value == null) {
				return acc
			}
			if (Array.isArray(value)) {
				acc[key] = key === 'messages' ? getBufferString(value as BaseMessage[]) : value.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join('\n\n')
			} else if (typeof value === 'object') {
				acc[key] = Object.keys(value).reduce((objAcc, objKey) => {
					objAcc[objKey] = objKey === 'messages' ? getBufferString(value[objKey]) : value[objKey]
					return objAcc
				}, {})
			} else {
				acc[key] = value
			}

			return acc
		}, {}),
  }
}


/**
 * Convert a state variable definition to a state variable.
 * 
 * @param variable 
 * @returns 
 */
export function stateVariable(variable: TStateVariable) {
	let defaultValue = null
	try {
		defaultValue = isFunction(variable.default) ?
			variable.default()
			: [
				XpertParameterTypeEnum.STRING,
				XpertParameterTypeEnum.TEXT,
				XpertParameterTypeEnum.PARAGRAPH
			].includes(variable.type) ? 
				variable.default 
				: typeof variable.default === 'string' ? 
					JSON.parse(variable.default)
					: variable.default
	} catch (error) {
		//
	}

	return {
		default: () => defaultValue,
		reducer: (left: any, right: any) => {
			if (!variable.type) {
				return right
			}
			if (variable.type.startsWith('array')) {
				left ??= []
				switch (variable.operation) {
					case VariableOperationEnum.APPEND:
						if (Array.isArray(right)) {
							return [...left, ...right]
						} else {
							return right == null ? left : [...left, right]
						}
					case VariableOperationEnum.OVERWRITE:
						return right
					default:
						return right
				}
			} else if (variable.type === XpertParameterTypeEnum.NUMBER) {
				switch (variable.operation) {
					case VariableOperationEnum.APPEND:
						return left == null ? Number(right) : left + Number(right)
					case VariableOperationEnum.OVERWRITE:
						return Number(right)
					default:
						return right
				}
			} else if (
				variable.type === XpertParameterTypeEnum.STRING ||
				variable.type === XpertParameterTypeEnum.TEXT ||
				variable.type === XpertParameterTypeEnum.PARAGRAPH
			) {
				switch (variable.operation) {
					case VariableOperationEnum.APPEND:
						return left == null ? right : left + right
					case VariableOperationEnum.OVERWRITE:
						return right ?? left
					default:
						return right
				}
			} else {
				return right
			}
		}
	}
}

export type TAgentSubgraphParams = {
	/**
	 * Collect mute nodes tag
	 */
	mute: TXpertAgentConfig['mute']
	/**
	 * Long-term memory store
	 */
	store: BaseStore

	// The subscriber response to client
	subscriber: Subscriber<MessageEvent>
	isDraft: boolean
	environment?: IEnvironment
}

/**
 * @deprecated The same as `TGraphTool` should be combined
 */
export type TSubAgent = {
	name: string
	tool: StructuredToolInterface | RunnableToolLike
	stateGraph?: Runnable
	nextNodes?: TXpertTeamNode[]
	failNode?: TXpertTeamNode
}

export function findChannelByTool(values: typeof AgentStateAnnotation.State, toolName: string): [string, TMessageChannel] {
	const name = Object.keys(values).find((key) => {
		if (key.startsWith('agent_')) {
			const channel = values[key] as TMessageChannel
			if (channel.messages?.find((message) => isBaseMessageChunk(message) && isAIMessageChunk(message) && message.tool_calls?.find((_) => _.name === toolName))) {
				return true
			}
		}
	})

	return name ? [name, values[name] as TMessageChannel] : [null, null]
}

/**
 * @deprecated Use `command` instead
 */
export async function rejectGraph(graph: CompiledStateGraph<any, any, any>, config: any, command: TInterruptCommand) {
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

export async function updateToolCalls(graph: CompiledStateGraph<any, any, any>, config: any, command: TInterruptCommand) {
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


/**
 * Recursively traverse an object and transform all string values
 *
 * @param obj The object to process
 * @param x   The function to apply to string values
 * @returns   A new object with transformed string values
 * @generator GPT
 */
export async function deepTransformValue<T>(obj: T, x: (val: string) => Promise<string>): Promise<T> {
	if (typeof obj === 'string') {
		// If it's a string, transform it directly
		return (await x(obj)) as unknown as T
	}

	if (Array.isArray(obj)) {
		// If it's an array, map each element recursively
		return (await Promise.all(obj.map((item) => deepTransformValue(item, x)))) as unknown as T
	}

	if (obj !== null && typeof obj === 'object') {
		// If it's an object, process each key
		const result: Record<string, unknown> = {}
		for (const key in obj) {
			// Omit blank values
			if (
				Object.prototype.hasOwnProperty.call(obj, key) &&
				obj[key] !== null &&
				obj[key] !== undefined &&
				obj[key] !== ''
			) {
				result[key] = await deepTransformValue((obj as Record<string, unknown>)[key], x)
			}
		}
		return result as T
	}

	// If it's neither string, array nor object, return as-is
	return obj
}
