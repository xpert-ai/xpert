import { ToolCall } from '@langchain/core/dist/messages/tool'
import { BaseMessage, getBufferString } from '@langchain/core/messages'
import { Annotation, messagesStateReducer } from '@langchain/langgraph'
import { SearchItem } from '@langchain/langgraph-checkpoint'
import {
	IEnvironment,
	STATE_VARIABLE_HUMAN,
	STATE_VARIABLE_SYS,
	STATE_VARIABLE_TITLE_CHANNEL,
	TChatRequestHuman,
	TMessageChannel,
	TStateVariable,
	VariableOperationEnum,
	XpertParameterTypeEnum
} from '@metad/contracts'
import { isFunction } from '@metad/server-common'
import { commonTimes } from './time'

export type TAgentStateSystem = {
	language: string
	user_email: string
	timezone: string
	date: string
	datetime: string
	common_times: string
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
