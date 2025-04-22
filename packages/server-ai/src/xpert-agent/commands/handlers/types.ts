import { ToolCall } from '@langchain/core/dist/messages/tool'
import { BaseMessage } from '@langchain/core/messages'
import { Runnable, RunnableLike, RunnableToolLike } from '@langchain/core/runnables'
import { StructuredToolInterface } from '@langchain/core/tools'
import { Annotation, messagesStateReducer } from '@langchain/langgraph'
import { SearchItem } from '@langchain/langgraph-checkpoint'
import {
	channelName,
	IEnvironment,
	IXpertAgent,
	STATE_VARIABLE_SYS,
	TMessageChannel,
	TStateVariable,
	TVariableAssigner,
	TXpertGraph,
	TXpertTeamNode,
	VariableOperationEnum,
	XpertParameterTypeEnum
} from '@metad/contracts'
import { isFunction } from '@metad/server-common'

export const STATE_VARIABLE_INPUT = 'input'
export const STATE_VARIABLE_TITLE_CHANNEL = channelName('title')

export type TSystemState = {
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
	[STATE_VARIABLE_SYS]: Annotation<TSystemState>({
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
			}) as TSystemState
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

export type TSubAgent = {
	name: string
	tool: StructuredToolInterface | RunnableToolLike
	node?: RunnableLike<typeof AgentStateAnnotation> | Runnable
	stateGraph?: Runnable
	nextNodes?: TXpertTeamNode[]
	failNode?: TXpertTeamNode
}

export function parseXmlString(content: string) {
	return content?.replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}

export type TGraphTool = {
	caller: string
	tool: StructuredToolInterface | RunnableToolLike
	variables?: TVariableAssigner[]
}

export function stateVariable(variable: TStateVariable) {
	const defaultValue = [
		XpertParameterTypeEnum.STRING,
		XpertParameterTypeEnum.TEXT,
		XpertParameterTypeEnum.PARAGRAPH
	].includes(variable.type)
		? variable.default
		: isFunction(variable.default)
			? variable.default
			: variable.default
				? JSON.parse(variable.default)
				: null

	return {
		default: () => defaultValue,
		reducer: (left, right) => {
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

export function allAgentsKey(graph: TXpertGraph): IXpertAgent[] {
	return graph.nodes.filter((n) => n.type === 'agent').map((_) => _.entity as IXpertAgent)
}

export function identifyAgent(agent: IXpertAgent) {
	return {
		id: agent.id,
		key: agent.key,
		name: agent.name,
		title: agent.title,
		description: agent.description,
		avatar: agent.avatar
	}
}

export function commonTimes() {
	const currentDate = new Date()

	// Get the current year
	const currentYear = currentDate.getFullYear()

	// Get the current month (starts from 0, so add 1)
	const currentMonth = currentDate.getMonth() + 1

	// Get the current day
	const currentDay = currentDate.getDate()

	// Calculate last year and the year before last
	const lastYear = currentYear - 1
	const yearBeforeLast = currentYear - 2

	// Calculate last month (need to check if the current month is January, if so, go back to December of the previous year)
	let lastMonth = currentMonth - 1
	let lastMonthYear = currentYear
	if (lastMonth === 0) {
		lastMonth = 12
		lastMonthYear -= 1
	}

	// Format the date as 2025-01
	const lastMonthFormatted = `${lastMonthYear}-${String(lastMonth).padStart(2, '0')}`

	// Generate common relative times
	const relativeTimes = {
		'This Year': currentYear,
		'Last Year': lastYear,
		'The Year Before Last': yearBeforeLast,
		'Last Month': lastMonthFormatted,
		Today: `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(currentDay).padStart(2, '0')}`
	}

	return Object.keys(relativeTimes)
		.map((time) => `${time}: ${relativeTimes[time]}`)
		.join('; ')
}
