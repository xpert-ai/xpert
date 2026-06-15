import { z, ZodSchema } from 'zod'
import { IndicatorStatusEnum, IndicatorType } from '@xpert-ai/contracts'
import { BasicIndicatorSchema, IndicatorSchema } from '../../ai/toolset/schema'
import { BIToolsEnum } from '../../ai/toolset/builtin/bi-toolset'
import { DataXMetricManagementToolName } from './constants'

export const TOOL_INDICATORS_PROMPTS_DEFAULT =
	`1. Before performing metric operations, use 'indicator_scope_get' to inspect the active project/model/business-area scope.\n` +
	`2. If 'indicator_scope_get' says no scope/project is selected, do NOT call 'list_indicators', 'indicator_retriever', create/edit/delete tools, cube context, or member retriever. First call 'indicator_scope_options' to list selectable projects, then call 'indicator_scope_set' with projectId. After calling 'indicator_scope_set', wait for that tool result before calling metric operation tools; never emit scope selection and metric operation tools in the same tool-call batch.\n` +
	`3. Use 'indicator_scope_set' to narrow metric operations by BI project, semantic model, business area, cube/entity, certification, tag, app availability, status, type, or search text. Mutating tools inherit a single selected model/business area/cube from the active scope; if multiple values are selected, pass the exact value explicitly.\n` +
	`4. 'indicator_retriever' tool can retrieve published indicators. For indicators in draft state, please use 'list_indicators' tool to list detailed indicators after the scope is selected.\n` +
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
	tool_indicators_scope?: MetricScope | null
	tool_indicators?: {
		cubes?: unknown[]
		indicators?: unknown[]
	} | null
}

const OptionalString = z.string().optional().nullable()
const OptionalStringArray = z.array(z.string()).optional().nullable()

export const MetricScopeSchema = z.object({
	project_id: OptionalString.describe('BI project ID, legacy snake_case alias'),
	projectId: OptionalString.describe('BI project ID'),
	model_id: OptionalString.describe('Single semantic model ID, legacy snake_case alias'),
	modelId: OptionalString.describe('Single semantic model ID'),
	model_ids: OptionalStringArray.describe('Semantic model IDs, legacy snake_case alias'),
	modelIds: OptionalStringArray.describe('Semantic model IDs'),
	business_area_id: OptionalString.describe('Single business area ID, legacy snake_case alias'),
	businessAreaId: OptionalString.describe('Single business area ID'),
	business_area_ids: OptionalStringArray.describe('Business area IDs, legacy snake_case alias'),
	businessAreaIds: OptionalStringArray.describe('Business area IDs'),
	cube_name: OptionalString.describe('Single cube/entity name, legacy snake_case alias'),
	cubeName: OptionalString.describe('Single cube/entity name'),
	entity: OptionalString.describe('Single cube/entity name'),
	entities: OptionalStringArray.describe('Cube/entity names'),
	certificationId: OptionalString.describe('Single certification ID'),
	certificationIds: OptionalStringArray.describe('Certification IDs'),
	tagId: OptionalString.describe('Single indicator tag ID'),
	tagIds: OptionalStringArray.describe('Indicator tag IDs'),
	isApplication: z.boolean().optional().nullable().describe('Filter indicators available in applications'),
	status: z.nativeEnum(IndicatorStatusEnum).optional().nullable().describe('Indicator status filter'),
	type: z.nativeEnum(IndicatorType).optional().nullable().describe('Indicator type filter'),
	search: OptionalString.describe('Text search for indicator code, name, or business definition')
})

export type MetricScopeInput = z.infer<typeof MetricScopeSchema>

export type MetricScope = {
	projectId?: string
	modelIds?: string[]
	businessAreaIds?: string[]
	entities?: string[]
	certificationIds?: string[]
	tagIds?: string[]
	isApplication?: boolean
	status?: IndicatorStatusEnum
	type?: IndicatorType
	search?: string
}

export const ListIndicatorsSchema = MetricScopeSchema

export const MetricScopeSetSchema = MetricScopeSchema.extend({
	replace: z
		.boolean()
		.optional()
		.nullable()
		.describe('Replace the active scope instead of merging with the current active scope')
})

export const MetricScopeClearSchema = z.object({
	keep_project: z
		.boolean()
		.optional()
		.nullable()
		.describe('Keep the currently selected BI project while clearing narrower filters')
})

export const MetricScopeOptionsSchema = MetricScopeSchema.extend({
	include_counts: z.boolean().optional().nullable().describe('Include lightweight count metadata when available')
})

export const MetricScopePreviewSchema = MetricScopeSchema.extend({
	limit: z.number().optional().nullable().default(10).describe('Maximum number of matching indicators to preview')
})

export const DeleteIndicatorSchema = z.object({
	code: z.string().describe('The unique code of indicator')
})

export const IndicatorRetrieverSchema = MetricScopeSchema.extend({
	query: z.string().describe('The query to search for indicators'),
	limit: z.number().optional().default(10).describe('The maximum number of indicators to retrieve')
})

const ScopedBasicIndicatorSchema = BasicIndicatorSchema.extend({
	businessAreaId: OptionalString.describe('Business area ID used to group this indicator')
}).partial({
	modelId: true,
	cube: true
})

const ScopedDeriveIndicatorSchema = IndicatorSchema.extend({
	businessAreaId: OptionalString.describe('Business area ID used to group this indicator')
}).partial({
	modelId: true,
	cube: true
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
		name: DataXMetricManagementToolName.SCOPE_GET,
		description: 'Get the current Data X metric management scope remembered in this agent session.',
		schema: z.object({})
	},
	{
		name: DataXMetricManagementToolName.SCOPE_SET,
		description:
			'Set the active metric management scope. Include projectId when no scope exists. Use this before list/retrieve/create/edit/delete tools to narrow later metric tools by project, semantic model, business area, cube, status, type, and search.',
		schema: MetricScopeSetSchema
	},
	{
		name: DataXMetricManagementToolName.SCOPE_CLEAR,
		description: 'Clear the active metric management scope, optionally keeping the selected BI project.',
		schema: MetricScopeClearSchema
	},
	{
		name: DataXMetricManagementToolName.SCOPE_OPTIONS,
		description:
			'List selectable metric scope options for projects, semantic models, business areas, statuses, and types. Safe to call when no scope exists.',
		schema: MetricScopeOptionsSchema
	},
	{
		name: DataXMetricManagementToolName.SCOPE_PREVIEW,
		description: 'Preview matching indicators for a scope before running metric operations.',
		schema: MetricScopePreviewSchema
	},
	{
		name: DataXMetricManagementToolName.CREATE_DERIVE_INDICATOR,
		description:
			'Create a new derive indicator in the active metric scope. Requires project scope. The unique code cannot be repeated in the project.',
		schema: ScopedDeriveIndicatorSchema
	},
	{
		name: DataXMetricManagementToolName.CREATE_BASIC_INDICATOR,
		description:
			'Create a new basic type indicator in the active metric scope. Requires project scope. The unique code cannot be repeated in the project.',
		schema: ScopedBasicIndicatorSchema
	},
	{
		name: DataXMetricManagementToolName.LIST_INDICATORS,
		description:
			'List indicators in the active metric scope. Requires project scope; do not use this tool to select a project.',
		schema: ListIndicatorsSchema
	},
	{
		name: DataXMetricManagementToolName.LIST_CUBES,
		description:
			'List cubes in the active metric scope. Requires project scope; do not use this tool to select a project.',
		schema: MetricScopeSchema
	},
	{
		name: DataXMetricManagementToolName.EDIT_INDICATOR,
		description: 'Edit an indicator by exact unique code in the active metric scope. Requires project scope.',
		schema: ScopedDeriveIndicatorSchema
	},
	{
		name: DataXMetricManagementToolName.DELETE_INDICATOR,
		description:
			'Delete an indicator by exact unique code in the active metric scope. Requires project scope and user confirmation.',
		schema: DeleteIndicatorSchema
	},
	{
		name: DataXMetricManagementToolName.INDICATOR_RETRIEVER,
		description:
			'Retrieve published indicators based on a query in the active metric scope. Requires project scope; do not use this tool to select a project.',
		schema: IndicatorRetrieverSchema,
		responseFormat: 'content_and_artifact'
	},
	{
		name: DataXMetricManagementToolName.GET_CUBE_CONTEXT,
		description:
			'Get the context info for the cube of an indicator in the active metric scope. Requires project scope.',
		schema: GetCubeContextSchema
	},
	{
		name: DataXMetricManagementToolName.DIMENSION_MEMBER_RETRIEVER,
		description:
			'Search for dimension member key information about filter conditions in the active metric scope. Requires project scope.',
		schema: DimensionMemberRetrieverSchema
	},
	{
		name: BIToolsEnum.SHOW_INDICATORS,
		description: 'Visually display detailed indicator data to users.',
		schema: ShowIndicatorsSchema
	}
]

export type ListIndicatorsInput = z.infer<typeof ListIndicatorsSchema>
export type MetricScopeSetInput = z.infer<typeof MetricScopeSetSchema>
export type MetricScopeClearInput = z.infer<typeof MetricScopeClearSchema>
export type MetricScopeOptionsInput = z.infer<typeof MetricScopeOptionsSchema>
export type MetricScopePreviewInput = z.infer<typeof MetricScopePreviewSchema>
export type DeleteIndicatorInput = z.infer<typeof DeleteIndicatorSchema>
export type IndicatorRetrieverInput = z.infer<typeof IndicatorRetrieverSchema>
export type ShowIndicatorsInput = z.infer<typeof ShowIndicatorsSchema>
export type DimensionMemberRetrieverInput = z.infer<typeof DimensionMemberRetrieverSchema>
export type GetCubeContextInput = z.infer<typeof GetCubeContextSchema>
export type BasicIndicatorInput = z.infer<typeof ScopedBasicIndicatorSchema>
export type DeriveIndicatorInput = z.infer<typeof ScopedDeriveIndicatorSchema>
