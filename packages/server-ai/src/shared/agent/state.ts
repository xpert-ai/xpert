import { ToolCall } from '@langchain/core/dist/messages/tool'
import { BaseMessage } from '@langchain/core/messages'
import { Annotation, messagesStateReducer } from '@langchain/langgraph'
import { SearchItem } from '@langchain/langgraph-checkpoint'
import {
	IEnvironment,
	IStorageFile,
	STATE_VARIABLE_HUMAN,
	STATE_VARIABLE_SYS,
	STATE_VARIABLE_TITLE_CHANNEL,
	TMessageChannel
} from '@metad/contracts'
import { commonTimes } from './time'

export type TAgentStateSystem = {
	language: string
	user_email: string
	timezone: string
	date: string
	datetime: string
	common_times: string
}

export type TAgentStateHuman = {
	input: string
	files: IStorageFile[]
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
	[STATE_VARIABLE_HUMAN]: Annotation<TAgentStateHuman>({
		reducer: (a, b) => {
			return b ?? a
		},
		default: () => ({} as TAgentStateHuman)
	}),
	toolCall: Annotation<ToolCall>({
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
		default: () => ({ messages: [] })
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

export function stateToParameters(state: typeof AgentStateAnnotation.State, environment?: IEnvironment) {
	const initValue: Record<string, any> = {}
	if (environment) {
		initValue.env = environment.variables.reduce((state, variable) => {
			state[variable.name] = variable.value
			return state
		}, {})
	}
	return Object.keys(state).reduce((acc, key) => {
		const value = state[key]
		if (Array.isArray(value)) {
			acc[key] = value.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join('\n\n')
		} else {
			acc[key] = value
		}
		return acc
	}, initValue)
}
