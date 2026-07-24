import { ModelTypeEnum } from '@xpert-ai/contracts'
import { Schema } from '@xpert-ai/ocap-core'
import { z } from 'zod'

export type SemanticModelSchemaInput = Omit<Schema, 'name'> & {
	name?: string
}

export const SemanticModelSchemaSchema = z.custom<SemanticModelSchemaInput>(
	(value) => {
		if (!value || typeof value !== 'object' || Array.isArray(value)) {
			return false
		}
		return ['cubes', 'dimensions', 'virtualCubes'].every(
			(key) => Reflect.get(value, key) === undefined || Array.isArray(Reflect.get(value, key))
		)
	},
	{
		message: 'Semantic model schema must be an object with array-valued cubes, dimensions, and virtualCubes.'
	}
)

export const SemanticModelWorkspaceListSchema = z.object({
	search: z.string().trim().max(200).optional().describe('Optional model name or description search text.'),
	limit: z.number().int().min(1).max(100).default(30).describe('Maximum number of workspaces to return.')
})

export const SemanticModelWorkspaceCreateSchema = z.object({
	key: z.string().trim().min(1).max(100).describe('Stable unique key for the semantic model workspace.'),
	name: z.string().trim().min(1).max(200).describe('Human-readable semantic model name.'),
	description: z.string().trim().max(1000).optional().describe('Optional model description.'),
	dataSourceId: z.string().trim().min(1).describe('Data source id used by the semantic model.'),
	catalog: z.string().trim().min(1).describe('Catalog or schema selected from the data source.'),
	type: z.nativeEnum(ModelTypeEnum).default(ModelTypeEnum.SQL).describe('Semantic model type.'),
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

export const OpenSemanticModelingSchema = z.object({
	modelId: z.string().trim().min(1).optional().describe('Optional semantic model workspace id to open.'),
	cubeName: z.string().trim().min(1).optional().describe('Optional cube to focus in the modeling view.')
})

export type SemanticModelWorkspaceCreateInput = z.infer<typeof SemanticModelWorkspaceCreateSchema>
export type SemanticModelSaveDraftInput = z.infer<typeof SemanticModelSaveDraftSchema>
