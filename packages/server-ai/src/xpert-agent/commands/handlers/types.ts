import { Runnable, RunnableLike, RunnableToolLike } from '@langchain/core/runnables'
import { StructuredToolInterface } from '@langchain/core/tools'
import {
	IXpertAgent,
	TStateVariable,
	TVariableAssigner,
	TXpertGraph,
	TXpertTeamNode,
	VariableOperationEnum,
	XpertParameterTypeEnum
} from '@metad/contracts'
import { isFunction } from '@metad/server-common'
import { AgentStateAnnotation } from '../../../shared'


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
	toolset: string
	tool: StructuredToolInterface | RunnableToolLike
	variables?: TVariableAssigner[]
	title: string
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
