import { tool } from '@langchain/core/tools'
import {
	DATA_X_SEMANTIC_MODELING_OPEN_TOOL_NAME,
	DATA_X_SEMANTIC_MODELING_PUBLIC_VIEW_KEY,
	DATA_X_VISUALIZATION_META_KEY
} from './constants'
import { OpenSemanticModelingSchema } from './schemas'

export function buildOpenSemanticModelingTool() {
	return tool(
		async (input) => {
			const parameters = compactRecord({
				modelId: input.modelId,
				cubeName: input.cubeName
			})
			const stableKey = [parameters.modelId, parameters.cubeName].filter(Boolean).join(':') || 'default'
			return JSON.stringify({
				message: 'Semantic modeling workbench is ready.',
				_meta: {
					[DATA_X_VISUALIZATION_META_KEY]: {
						type: 'xpert.extension_view',
						title: '语义模型建模',
						slotKey: 'tool:semantic-modeling',
						parameterKey: `semantic-modeling:${stableKey}`,
						renderMode: 'replace',
						payload: {
							version: 1,
							viewKey: DATA_X_SEMANTIC_MODELING_PUBLIC_VIEW_KEY,
							parameters,
							initialQuery: {
								page: 1,
								pageSize: 50
							}
						},
						metadata: {
							source: 'agent-middleware',
							sourceId: DATA_X_SEMANTIC_MODELING_OPEN_TOOL_NAME
						}
					}
				}
			})
		},
		{
			name: DATA_X_SEMANTIC_MODELING_OPEN_TOOL_NAME,
			description:
				'Open the Data X semantic modeling workbench for human review, schema editing, validation, and publishing.',
			schema: OpenSemanticModelingSchema,
			verboseParsingErrors: true
		}
	)
}

function compactRecord(input: Record<string, string | undefined>) {
	const result: Record<string, string> = {}
	for (const [key, value] of Object.entries(input)) {
		if (value?.trim()) {
			result[key] = value.trim()
		}
	}
	return result
}
