import { DynamicStructuredTool, tool } from '@langchain/core/tools'
import { z } from 'zod'
import { markdownModelCubes } from '../../ai/toolset/types'
import { buildOpenMetricManagementTool } from './tool'
import { DataXMetricManagementSession } from './datax-metric-management.service'
import {
	IndicatorsVariableEnum,
	MetricManagementToolDefinitions,
	MetricState,
	TOOL_INDICATORS_PROMPTS_DEFAULT
} from './schemas'

export { IndicatorsVariableEnum, TOOL_INDICATORS_PROMPTS_DEFAULT }

export class DataXMetricManagementRuntime {
	constructor(private readonly session: DataXMetricManagementSession) {}

	async init() {
		await this.session.init()
	}

	createStateSchema() {
		return z.object({
			tool_indicators_prompts_default: z.string().default(TOOL_INDICATORS_PROMPTS_DEFAULT),
			tool_indicators_cubes: z.string().default(markdownModelCubes(this.session.models)),
			tool_indicators_scope: z.unknown().default(this.session.metricScope),
			[IndicatorsVariableEnum.INDICATORS]: z
				.object({
					cubes: z.array(z.unknown()).optional(),
					indicators: z.array(z.unknown()).optional()
				})
				.default({})
		})
	}

	createInitialState(state: MetricState = {}) {
		return this.session.createInitialState(state, TOOL_INDICATORS_PROMPTS_DEFAULT)
	}

	createTools(): DynamicStructuredTool[] {
		return [
			buildOpenMetricManagementTool(),
			...MetricManagementToolDefinitions.map((definition) =>
				tool(
					async (input, config) => {
						switch (definition.name) {
							case 'indicator_scope_get':
								return this.session.metricScopeGetTool(input as never, config)
							case 'indicator_scope_set':
								return this.session.metricScopeSetTool(input as never, config)
							case 'indicator_scope_clear':
								return this.session.metricScopeClearTool(input as never, config)
							case 'indicator_scope_options':
								return this.session.metricScopeOptionsTool(input as never, config)
							case 'indicator_scope_preview':
								return this.session.metricScopePreviewTool(input as never, config)
							case 'create_derive_indicator':
								return this.session.createDeriveIndicatorTool(input as never, config)
							case 'create_basic_indicator':
								return this.session.createBasicIndicatorTool(input as never, config)
							case 'list_indicators':
								return this.session.listIndicatorsTool(input as never, config)
							case 'indicator_list_cubes':
								return this.session.listCubesTool(input as never, config)
							case 'edit_indicator':
								return this.session.editIndicatorTool(input as never, config)
							case 'delete_indicator':
								return this.session.deleteIndicatorTool(input as never, config)
							case 'indicator_retriever':
								return this.session.indicatorRetrieverTool(input as never, config)
							case 'get_indicator_cube_context':
								return this.session.getCubeContextTool(input as never, config)
							case 'dimension_member_retriever':
								return this.session.dimensionMemberRetrieverTool(input as never, config)
							case 'show_indicators':
								return this.session.showIndicatorsTool(input as never, config)
							default:
								throw new Error(`Unsupported metric management tool '${definition.name}'`)
						}
					},
					{
						name: definition.name,
						description: definition.description,
						schema: definition.schema,
						...(definition.responseFormat ? { responseFormat: definition.responseFormat } : {})
					}
				)
			)
		]
	}
}

export function buildDataXMetricManagementToolDefinitions() {
	return [
		buildOpenMetricManagementTool(),
		...MetricManagementToolDefinitions.map((definition) =>
			tool(
				async () => {
					throw new Error(`Tool '${definition.name}' requires an initialized metric management middleware.`)
				},
				{
					name: definition.name,
					description: definition.description,
					schema: definition.schema,
					...(definition.responseFormat ? { responseFormat: definition.responseFormat } : {})
				}
			)
		)
	]
}
