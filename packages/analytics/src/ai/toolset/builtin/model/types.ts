import { interrupt } from '@langchain/langgraph'
import { BaseStore } from '@langchain/langgraph-checkpoint'
import { IIndicator } from '@metad/contracts'
import { Logger } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { TBIContext } from '../../../types'

export type SemanticModelToolContext = TBIContext & {
	commandBus?: CommandBus
	logger?: Logger
}

export enum SemanticModelToolsEnum {
	CREATE_DIMENSION = 'create_dimension',
	LIST_CUBES = 'list_cubes',
	INIT_MODEL = 'init_model'
}

export enum SemanticModelVariableEnum {
	CurrentCubeContext = 'tool_model_cube_context',
}

export type TToolSemanticModelVariable = {
	indicators: IIndicator[]
}

export type TSemanticModelCredentials = {
	project: string
	dataPermission?: boolean
}

export async function interruptModelId(store: BaseStore, namespace: string[]) {
	const memory = await store.get(namespace, 'model_id')
	let modelId = memory?.value?.modelId as string
	if (!modelId) {
		const value = interrupt<{ category: 'BI'; type: string; title: string; message: string }, { modelId: string }>(
			// Any JSON serializable value to surface to the human.
			// For example, a question or a piece of text or a set of keys in the state
			{
				category: 'BI',
				type: 'init_model',
				title: 'Initialize Semantic Model',
				message: `Please provide the model ID to list cubes.`
			}
		)

		modelId = value.modelId
		await store.put(namespace, 'model_id', { modelId })
	}

	return modelId
}
