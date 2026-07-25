import { ModelTypeEnum } from '@xpert-ai/contracts'
import { Schema } from '@xpert-ai/ocap-core'
import { z } from 'zod'

export type SemanticModelSchemaInput = Omit<Schema, 'name'> & {
	name?: string
}

const SemanticModelNamedObjectSchema = z
	.object({
		name: z.string().trim().min(1).describe('Stable technical name.')
	})
	.passthrough()

const SemanticModelSchemaDocumentSchema = z
	.object({
		name: z.string().trim().optional().describe('Optional semantic schema name.'),
		cubes: z
			.array(SemanticModelNamedObjectSchema)
			.describe('Complete physical Cube definitions, including fact sources, dimensions, and measures.'),
		dimensions: z
			.array(SemanticModelNamedObjectSchema)
			.describe('Complete shared dimension, hierarchy, and level definitions.'),
		virtualCubes: z
			.array(SemanticModelNamedObjectSchema)
			.describe('Complete virtual Cube definitions; use an empty array when none exist.')
	})
	.passthrough()

export const SemanticModelSchemaSchema = z
	.preprocess(parseSemanticModelSchemaDocument, SemanticModelSchemaDocumentSchema)
	.transform((value) => value as unknown as SemanticModelSchemaInput)

function parseSemanticModelSchemaDocument(value: unknown): unknown {
	if (typeof value !== 'string') {
		return value
	}
	try {
		return JSON.parse(value) as unknown
	} catch {
		return value
	}
}

export const SemanticModelWorkspaceListSchema = z.object({
	search: z.string().trim().max(200).optional().describe('Optional model name or description search text.'),
	limit: z.number().int().min(1).max(100).default(30).describe('Maximum number of workspaces to return.')
})

export const SemanticModelDataSourceListSchema = z.object({
	search: z.string().trim().max(200).optional().describe('Optional data source name search text.')
})

export const SemanticModelCatalogListSchema = z.object({
	dataSourceId: z
		.string()
		.trim()
		.min(1)
		.describe('Exact data source id returned by semantic_model_list_data_sources.')
})

export const SemanticModelProjectListSchema = z.object({
	search: z.string().trim().max(200).optional().describe('Optional accessible project name search text.')
})

export const SemanticModelWorkspaceReadSchema = z.object({
	modelId: z.string().trim().min(1).describe('Semantic model workspace id.')
})

export const SemanticModelListTablesSchema = z.object({
	modelId: z.string().trim().min(1).describe('Semantic model workspace id whose source tables should be listed.')
})

export const SemanticModelDescribeTableSchema = z.object({
	modelId: z.string().trim().min(1).describe('Semantic model workspace id.'),
	tableName: z.string().trim().min(1).max(500).describe('Qualified physical table name to inspect.')
})

export const SemanticModelWorkspaceCreateSchema = z.object({
	key: z.string().trim().min(1).max(100).describe('Stable unique key for the semantic model workspace.'),
	name: z.string().trim().min(1).max(200).describe('Human-readable semantic model name.'),
	description: z.string().trim().max(1000).optional().describe('Optional model description.'),
	dataSourceId: z.string().trim().min(1).describe('Data source id used by the semantic model.'),
	catalog: z.string().trim().min(1).describe('Catalog or schema selected from the data source.'),
	type: z.nativeEnum(ModelTypeEnum).default(ModelTypeEnum.SQL).describe('Semantic model type.'),
	projectId: z
		.string()
		.trim()
		.min(1)
		.optional()
		.describe('Optional accessible project that will govern metrics created from this model.'),
	businessAreaId: z.string().trim().min(1).optional().describe('Optional business area id.'),
	changeSummary: z
		.string()
		.trim()
		.min(1)
		.max(160)
		.describe('Short user-visible description of the workspace creation.')
})

export const SemanticModelSaveDraftSchema = z.object({
	modelId: z.string().trim().min(1).describe('Semantic model workspace id.'),
	schema: SemanticModelSchemaSchema.describe(
		'Complete semantic schema draft containing cubes, dimensions, and virtual cubes.'
	),
	baseVersion: z.number().int().min(0).optional().describe('Expected draft version for optimistic validation.'),
	changeSummary: z.string().trim().min(1).max(160).describe('Short user-visible description of this draft change.')
})

export const SemanticModelPublishSchema = z.object({
	modelId: z.string().trim().min(1).describe('Semantic model workspace id.'),
	releaseNotes: z.string().trim().max(2000).optional().describe('Optional semantic model release notes.'),
	changeSummary: z.string().trim().min(1).max(160).describe('Short user-visible description of this publish.')
})

export const SemanticModelExecuteQuerySchema = z.object({
	modelId: z.string().trim().min(1).describe('Semantic model workspace id.'),
	cubeName: z.string().trim().min(1).describe('Cube referenced by the MDX statement.'),
	statement: z.string().trim().min(1).max(50000).describe('Complete MDX SELECT statement to execute.'),
	limit: z.number().int().min(1).max(500).default(200).describe('Maximum number of result rows to return.')
})

export const OpenSemanticModelingSchema = z.object({
	modelId: z.string().trim().min(1).optional().describe('Optional semantic model workspace id to open.'),
	cubeName: z.string().trim().min(1).optional().describe('Optional cube to focus in the modeling view.')
})

export type SemanticModelWorkspaceCreateInput = z.infer<typeof SemanticModelWorkspaceCreateSchema>
export type SemanticModelSaveDraftInput = z.infer<typeof SemanticModelSaveDraftSchema>
