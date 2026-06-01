import { DynamicStructuredTool, tool } from '@langchain/core/tools'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { IXpertToolset, XpertToolsetCategoryEnum } from '@xpert-ai/contracts'
import { IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { TBuiltinToolsetParams } from '@xpert-ai/server-ai'
import { z, ZodSchema } from 'zod'
import { BIToolsEnum } from '../../ai/toolset/builtin/bi-toolset'
import { IndicatorsToolset } from '../../ai/toolset/builtin/indicators/indicators'
import { TOOL_INDICATORS_PROMPTS_DEFAULT } from '../../ai/toolset/builtin/indicators/prompts'
import { IndicatorToolsEnum, IndicatorsVariableEnum } from '../../ai/toolset/builtin/indicators/types'
import { BasicIndicatorSchema, IndicatorSchema } from '../../ai/toolset/schema'
import { markdownModelCubes } from '../../ai/toolset/types'
import { buildOpenMetricManagementTool } from './tool'

type MetricState = {
	tool_indicators_prompts_default?: string | null
	tool_indicators_cubes?: string | null
	tool_indicators?: {
		cubes?: unknown[]
		indicators?: unknown[]
	} | null
}

export class DataXMetricManagementRuntime {
	private readonly indicatorToolset: IndicatorsToolset

	constructor(commandBus: CommandBus, queryBus: QueryBus, context: IAgentMiddlewareContext) {
		this.indicatorToolset = new IndicatorsToolset(
			createIndicatorToolsetConfig(context),
			createToolsetParams(commandBus, queryBus, context)
		)
	}

	async init() {
		await this.indicatorToolset.initTools()
	}

	createStateSchema() {
		return z.object({
			tool_indicators_prompts_default: z.string().default(TOOL_INDICATORS_PROMPTS_DEFAULT),
			tool_indicators_cubes: z.string().default(markdownModelCubes(this.indicatorToolset.models)),
			[IndicatorsVariableEnum.INDICATORS]: z
				.object({
					cubes: z.array(z.unknown()).optional(),
					indicators: z.array(z.unknown()).optional()
				})
				.default({})
		})
	}

	createInitialState(state: MetricState = {}) {
		return {
			tool_indicators_prompts_default: state.tool_indicators_prompts_default || TOOL_INDICATORS_PROMPTS_DEFAULT,
			tool_indicators_cubes: state.tool_indicators_cubes || markdownModelCubes(this.indicatorToolset.models),
			[IndicatorsVariableEnum.INDICATORS]: state[IndicatorsVariableEnum.INDICATORS] ?? {}
		}
	}

	createTools(): DynamicStructuredTool[] {
		return [buildOpenMetricManagementTool(), ...this.indicatorToolset.tools.filter(isDynamicStructuredTool)]
	}
}

export function buildDataXMetricManagementToolDefinitions() {
	return [
		buildOpenMetricManagementTool(),
		metadataTool(
			IndicatorToolsEnum.SWITCH_PROJECT,
			'Switch or create a BI project before metric management operations.',
			z.object({
				project_id: z
					.string()
					.optional()
					.nullable()
					.describe('The ID of project if switching to an existing one'),
				is_new: z
					.boolean()
					.optional()
					.nullable()
					.describe('Whether to create a new project if no project_id is provided')
			})
		),
		metadataTool(IndicatorToolsEnum.LIST_CUBES, 'List cubes in the project workspace.', z.object({})),
		metadataTool(
			IndicatorToolsEnum.LIST_INDICATORS,
			'List all indicators in the selected BI project.',
			z.object({
				model_id: z.string().optional().nullable().describe('Model ID'),
				cube_name: z.string().optional().nullable().describe('Cube Name')
			})
		),
		metadataTool(
			IndicatorToolsEnum.CREATE_DERIVE_INDICATOR,
			'Create a new derive indicator. The unique code cannot be repeated in the project.',
			IndicatorSchema
		),
		metadataTool(
			IndicatorToolsEnum.CREATE_BASIC_INDICATOR,
			'Create a new basic type indicator. The unique code cannot be repeated in the project.',
			BasicIndicatorSchema
		),
		metadataTool(IndicatorToolsEnum.EDIT_INDICATOR, 'Edit an indicator by its exact unique code.', IndicatorSchema),
		metadataTool(
			IndicatorToolsEnum.DELETE_INDICATOR,
			'Delete an indicator by its exact unique code.',
			z.object({
				code: z.string().describe('The unique code of indicator')
			})
		),
		metadataTool(
			IndicatorToolsEnum.INDICATOR_RETRIEVER,
			'Retrieve published indicators based on a query.',
			z.object({
				query: z.string().describe('The query to search for indicators'),
				limit: z.number().optional().default(10).describe('The maximum number of indicators to retrieve')
			})
		),
		metadataTool(
			BIToolsEnum.SHOW_INDICATORS,
			'Visually display detailed indicator data to users.',
			z.object({
				modelId: z.string().describe('Model ID of the cube to which the indicator belongs'),
				indicators: z.array(
					z.object({
						cube: z.string().describe('Cube to which the indicator belongs'),
						indicator: z.string().describe('The code of indicator, or the name of measure')
					})
				)
			})
		),
		metadataTool(
			IndicatorToolsEnum.DIMENSION_MEMBER_RETRIEVER,
			'Search for dimension member key information about filter conditions.',
			z.object({
				modelId: z.string().describe('The model ID'),
				cube: z.string().describe('The cube name'),
				query: z.string().describe('The keywords to look up members'),
				dimension: z.string().describe('The dimension to look up in the retriever'),
				hierarchy: z.string().optional().describe('The hierarchy to look up in the retriever'),
				level: z.string().optional().describe('The level to look up in the retriever'),
				topK: z.number().optional().describe('Top k results'),
				re_embedding: z
					.boolean()
					.optional()
					.nullable()
					.default(false)
					.describe('Need re-embedding dimension members if the user explicitly requires it')
			})
		),
		metadataTool(
			IndicatorToolsEnum.GET_CUBE_CONTEXT,
			'Get the context info for the cube of an indicator.',
			z.object({
				model_id: z.string().describe('The model id of cube'),
				cube_name: z.string().describe('The name of cube')
			})
		)
	]
}

function metadataTool(name: string, description: string, schema: ZodSchema): DynamicStructuredTool<ZodSchema> {
	return tool(
		async () => {
			throw new Error(`Tool '${name}' requires an initialized metric management middleware.`)
		},
		{
			name,
			description,
			schema
		}
	)
}

function isDynamicStructuredTool(value: unknown): value is DynamicStructuredTool {
	return value instanceof DynamicStructuredTool
}

function createIndicatorToolsetConfig(context: IAgentMiddlewareContext): IXpertToolset {
	return {
		id: context.node.id,
		tenantId: context.tenantId,
		organizationId: context.organizationId ?? undefined,
		workspaceId: context.workspaceId,
		name: 'Data X Metric Management',
		type: IndicatorsToolset.provider,
		category: XpertToolsetCategoryEnum.BUILTIN,
		credentials: {},
		tools: []
	}
}

function createToolsetParams(
	commandBus: CommandBus,
	queryBus: QueryBus,
	context: IAgentMiddlewareContext
): TBuiltinToolsetParams {
	return {
		tenantId: context.tenantId,
		organizationId: context.organizationId ?? undefined,
		userId: context.userId,
		projectId: context.projectId,
		conversationId: context.conversationId,
		xpertId: context.xpertId,
		agentKey: context.agentKey,
		env: {},
		commandBus,
		queryBus,
		store: context.store
	}
}
