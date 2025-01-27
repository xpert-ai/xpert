import { ToolCall } from '@langchain/core/dist/messages/tool'
import { BaseMessage } from '@langchain/core/messages'
import { Runnable, RunnableLike, RunnableToolLike } from '@langchain/core/runnables'
import { StructuredToolInterface } from '@langchain/core/tools'
import { Annotation, CompiledStateGraph, messagesStateReducer } from '@langchain/langgraph'
import { SearchItem } from '@langchain/langgraph-checkpoint'
import { TStateVariable, TVariableAssigner, TXpertTeamNode, VariableOperationEnum } from '@metad/contracts'

export const STATE_VARIABLE_SYS_LANGUAGE = 'sys_language'
export const STATE_VARIABLE_USER_EMAIL = 'user_email'
export const STATE_VARIABLE_USER_TIMEZONE = 'user_timezone'

export const AgentStateAnnotation = Annotation.Root({
	messages: Annotation<BaseMessage[]>({
		reducer: messagesStateReducer,
		default: () => []
	}),
	input: Annotation<string>({
		reducer: (a, b) => b ?? a,
		default: () => ''
	}),
	[STATE_VARIABLE_SYS_LANGUAGE]: Annotation<string>({
		reducer: (a, b) => b ?? a,
		default: () => null
	}),
	[STATE_VARIABLE_USER_EMAIL]: Annotation<string>({
		reducer: (a, b) => b ?? a,
		default: () => null
	}),
	[STATE_VARIABLE_USER_TIMEZONE]: Annotation<string>({
		reducer: (a, b) => b ?? a,
		default: () => null
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
	return {
		default: variable.type === 'string' ? variable.default : variable.default ? JSON.parse(variable.default) : null,
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
				}
			} else if (variable.type === 'number') {
				switch (variable.operation) {
					case VariableOperationEnum.APPEND:
						return left == null ? Number(right) : left + Number(right)
					case VariableOperationEnum.OVERWRITE:
						return right
				}
			}
		}
	}
}
