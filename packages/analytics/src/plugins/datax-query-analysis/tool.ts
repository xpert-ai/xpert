import { tool } from '@langchain/core/tools'
import {
	DATA_X_QUERY_ANALYSIS_OPEN_TOOL_NAME,
	DATA_X_QUERY_ANALYSIS_PUBLIC_VIEW_KEY,
	DATA_X_QUERY_VISUALIZATION_META_KEY
} from './constants'
import { DataXQueryOpenSchema } from './schemas'

export function buildOpenDataXQueryTool() {
	return tool(
		async (input) =>
			JSON.stringify({
				message: 'Data X query analysis workbench is ready.',
				_meta: {
					[DATA_X_QUERY_VISUALIZATION_META_KEY]: createQueryVisualization(input)
				}
			}),
		{
			name: DATA_X_QUERY_ANALYSIS_OPEN_TOOL_NAME,
			description:
				'Open the Data X query analysis Workbench to select a semantic model and cube, edit MDX, execute it, and inspect tabular results.',
			schema: DataXQueryOpenSchema,
			verboseParsingErrors: true
		}
	)
}

export function createQueryVisualization(input: {
	modelId?: string
	cubeName?: string
	statement?: string
	autoRun?: boolean
}) {
	const parameters = compactRecord({
		modelId: input.modelId,
		cubeName: input.cubeName,
		statement: input.statement
	})
	if (input.autoRun) {
		parameters.autoRun = true
	}
	const stableKey = [input.modelId, input.cubeName, input.statement].filter(Boolean).join(':') || 'default'
	return {
		type: 'xpert.extension_view',
		title: '数据查询分析',
		slotKey: 'tool:datax-query-analysis',
		parameterKey: `datax-query:${stableKey.slice(0, 160)}`,
		renderMode: 'replace',
		payload: {
			version: 1,
			viewKey: DATA_X_QUERY_ANALYSIS_PUBLIC_VIEW_KEY,
			parameters,
			initialQuery: {
				page: 1,
				pageSize: 200
			}
		},
		metadata: {
			source: 'agent-middleware',
			sourceId: DATA_X_QUERY_ANALYSIS_OPEN_TOOL_NAME
		}
	}
}

function compactRecord(input: Record<string, string | undefined>) {
	const result: Record<string, string | boolean> = {}
	for (const [key, value] of Object.entries(input)) {
		if (value?.trim()) {
			result[key] = value.trim()
		}
	}
	return result
}
