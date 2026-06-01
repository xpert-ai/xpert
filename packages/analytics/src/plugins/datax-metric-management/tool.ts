import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import {
	DATA_X_METRIC_PUBLIC_VIEW_KEY,
	INDICATOR_MANAGEMENT_OPEN_TOOL_NAME,
	XPERT_VISUALIZATION_META_KEY
} from './constants'

const OpenMetricManagementSchema = z.object({
	projectId: z.string().optional().describe('Optional BI project id to preselect in the metric management view.'),
	modelId: z.string().optional().describe('Optional semantic model id to preselect in the metric management view.')
})

export function buildOpenMetricManagementTool() {
	return tool(
		async (input) => {
			const parameters = compactRecord({
				projectId: input['projectId'],
				modelId: input['modelId']
			})
			const stableKey = [parameters['projectId'], parameters['modelId']].filter(Boolean).join(':') || 'default'

			return JSON.stringify({
				message: 'Metric management plugin view is ready.',
				_meta: {
					[XPERT_VISUALIZATION_META_KEY]: {
						type: 'xpert.extension_view',
						title: '指标管理',
						slotKey: 'tool:indicator-management',
						parameterKey: `metrics:${stableKey}`,
						renderMode: 'replace',
						payload: {
							version: 1,
							viewKey: DATA_X_METRIC_PUBLIC_VIEW_KEY,
							parameters,
							initialQuery: {
								page: 1,
								pageSize: 20
							}
						},
						metadata: {
							source: 'mcp-tool',
							sourceId: 'indicator_management_open'
						}
					}
				}
			})
		},
		{
			name: INDICATOR_MANAGEMENT_OPEN_TOOL_NAME,
			description:
				'Open the Data X metric management plugin view in the assistant workbench. Use it when users want to manage, list, create, edit, publish, delete, embed, or refresh indicators.',
			schema: OpenMetricManagementSchema
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
