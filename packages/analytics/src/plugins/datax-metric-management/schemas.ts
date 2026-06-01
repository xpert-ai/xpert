import { z, ZodSchema } from 'zod'
import { BIToolsEnum } from '../../ai/toolset/builtin/bi-toolset'
import { BasicIndicatorSchema, IndicatorSchema } from '../../ai/toolset/schema'
import { DataXMetricManagementToolName } from './constants'

export const TOOL_INDICATORS_PROMPTS_DEFAULT =
	`1. Before performing any operations, please call the tool 'switch_project' to select or create a project (leave projectId blank if you don't know it), and then use this project for other operations.\n` +
	`3. 'indicator_retriever' tool can retrieve published indicators. For indicators in draft state, please use 'list_indicators' tool to list detailed indicators.\n` +
	`## Cube Context
  Before creating an indicator or call 'dimension_member_retriever', you need to call the 'get_indicator_cube_context' tool to get the Context of the Cube to be used.
  Before creating an indicator, you need to call the 'list_indicators' tool to check existing indicators that can be reused.
## Filter Conditions
  1. When creating a indicator with a specified filter condition, you need to use the 'dimension_member_retriever' tool to retrieve the exact key of the dimension member as the filter condition's member.
  2. Try to put explicitly specified dimension members in filter conditions rather than in formula.
## Indicator types
  - Priority to create a basic indicator if the requirements can be met based on the following conditions: by reusing an existing indicator 'code' as the 'measure' field of the new indicator and using 'filters' to distinguish different dimension members.
  - Otherwise to create derive indicators: calculate the combination of existing indicators through formulas.
	You can also use existing indicators in formula of combination indicators.
  For example, if you already have an indicator code = A that represents the month-on-month growth rate, and you want to create a new indicator code = B that represents the month-on-month growth rate of product X, you can create a basic indicator: use A as the measure, and filters = [{dimension: 'product', member: 'X'}].
`

export enum IndicatorsVariableEnum {
	INDICATORS = 'tool_indicators'
}

export type MetricState = {
	tool_indicators_prompts_default?: string | null
	tool_indicators_cubes?: string | null
	tool_indicators?: {
		cubes?: unknown[]
		indicators?: unknown[]
	} | null
}

export const SwitchProjectSchema = z.object({
	project_id: z.string().optional().nullable().describe('The ID of project if switching to an existing one'),
	is_new: z
		.boolean()
		.optional()
		.nullable()
		.describe(
			'Whether to create a new project if no project_id is provided, otherwise load project from memory store first'
		)
})

export const ListIndicatorsSchema = z.object({
	model_id: z.string().optional().nullable().describe('Model ID'),
	cube_name: z.string().optional().nullable().describe('Cube Name')
})

export const DeleteIndicatorSchema = z.object({
	code: z.string().describe('The unique code of indicator')
})

export const IndicatorRetrieverSchema = z.object({
	query: z.string().describe('The query to search for indicators'),
	limit: z.number().optional().default(10).describe('The maximum number of indicators to retrieve')
})

export const ShowIndicatorsSchema = z.object({
	modelId: z.string().describe('Model ID of the cube to which the indicator belongs'),
	indicators: z.array(
		z.object({
			cube: z.string().describe('Cube to which the indicator belongs'),
			indicator: z.string().describe('The code of indicator, or the name of measure')
		})
	)
})

export const DimensionMemberRetrieverSchema = z.object({
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

export const GetCubeContextSchema = z.object({
	model_id: z.string().describe('The model id of cube'),
	cube_name: z.string().describe('The name of cube')
})

export const MetricManagementToolDefinitions: Array<{
	name: string
	description: string
	schema: ZodSchema
	responseFormat?: 'content_and_artifact'
}> = [
	{
		name: DataXMetricManagementToolName.SWITCH_PROJECT,
		description: 'Switch or create a BI project before metric management operations.',
		schema: SwitchProjectSchema
	},
	{
		name: DataXMetricManagementToolName.CREATE_DERIVE_INDICATOR,
		description: 'Create a new derive indicator. The unique code cannot be repeated in the project.',
		schema: IndicatorSchema
	},
	{
		name: DataXMetricManagementToolName.CREATE_BASIC_INDICATOR,
		description: 'Create a new basic type indicator. The unique code cannot be repeated in the project.',
		schema: BasicIndicatorSchema
	},
	{
		name: DataXMetricManagementToolName.LIST_INDICATORS,
		description: 'List all indicators in the selected BI project.',
		schema: ListIndicatorsSchema
	},
	{
		name: DataXMetricManagementToolName.LIST_CUBES,
		description: 'List cubes in the project workspace.',
		schema: z.object({})
	},
	{
		name: DataXMetricManagementToolName.EDIT_INDICATOR,
		description: 'Edit an indicator by its exact unique code.',
		schema: IndicatorSchema
	},
	{
		name: DataXMetricManagementToolName.DELETE_INDICATOR,
		description: 'Delete an indicator by its exact unique code.',
		schema: DeleteIndicatorSchema
	},
	{
		name: DataXMetricManagementToolName.INDICATOR_RETRIEVER,
		description: 'Retrieve published indicators based on a query.',
		schema: IndicatorRetrieverSchema,
		responseFormat: 'content_and_artifact'
	},
	{
		name: DataXMetricManagementToolName.GET_CUBE_CONTEXT,
		description: 'Get the context info for the cube of an indicator.',
		schema: GetCubeContextSchema
	},
	{
		name: DataXMetricManagementToolName.DIMENSION_MEMBER_RETRIEVER,
		description: 'Search for dimension member key information about filter conditions.',
		schema: DimensionMemberRetrieverSchema
	},
	{
		name: BIToolsEnum.SHOW_INDICATORS,
		description: 'Visually display detailed indicator data to users.',
		schema: ShowIndicatorsSchema
	}
]

export type SwitchProjectInput = z.infer<typeof SwitchProjectSchema>
export type ListIndicatorsInput = z.infer<typeof ListIndicatorsSchema>
export type DeleteIndicatorInput = z.infer<typeof DeleteIndicatorSchema>
export type IndicatorRetrieverInput = z.infer<typeof IndicatorRetrieverSchema>
export type ShowIndicatorsInput = z.infer<typeof ShowIndicatorsSchema>
export type DimensionMemberRetrieverInput = z.infer<typeof DimensionMemberRetrieverSchema>
export type GetCubeContextInput = z.infer<typeof GetCubeContextSchema>
export type BasicIndicatorInput = z.infer<typeof BasicIndicatorSchema>
export type DeriveIndicatorInput = z.infer<typeof IndicatorSchema>
