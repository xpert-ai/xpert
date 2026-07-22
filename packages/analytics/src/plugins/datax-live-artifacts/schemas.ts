import type { DataXLiveArtifactJsonValue } from '@xpert-ai/contracts'
import { z } from 'zod'

const IdentifierSchema = z
	.string()
	.trim()
	.min(1)
	.max(80)
	.regex(/^[A-Za-z][A-Za-z0-9._:-]*$/, 'Use a stable alphanumeric identifier')

const CONTROL_PLACEHOLDER_PATTERN = /\$\{controls\.([A-Za-z][A-Za-z0-9._:-]*)\}/g

const JsonValueSchema: z.ZodType<DataXLiveArtifactJsonValue> = z.lazy(() =>
	z.union([
		z.string().max(20_000),
		z.number().finite(),
		z.boolean(),
		z.null(),
		z.array(JsonValueSchema).max(200),
		z.record(z.string().max(120), JsonValueSchema)
	])
)

const TargetSchema = z
	.object({
		entityId: z.string().trim().min(1).max(255).optional(),
		entityTypeCode: z.string().trim().min(1).max(120).optional(),
		entityRef: z.string().trim().min(1).max(500).optional()
	})
	.strict()
	.refine((target) => Boolean(target.entityId || target.entityRef), {
		message: 'target requires entityId or entityRef'
	})

const BindingSchema = z
	.object({
		id: IdentifierSchema,
		label: z.string().trim().min(1).max(160).optional(),
		resourceId: z.string().trim().min(1).max(160),
		actionTypeCode: z.enum(['mdx.query_metric_snapshot', 'mdx.query_cube_slice']),
		target: TargetSchema,
		params: z.record(z.string().max(120), JsonValueSchema)
	})
	.strict()

const ControlSchema = z
	.object({
		id: IdentifierSchema,
		label: z.string().trim().min(1).max(120),
		type: z.enum(['text', 'number', 'date', 'select']),
		defaultValue: z.union([z.string().max(500), z.number().finite(), z.boolean(), z.null()]).optional(),
		options: z
			.array(
				z
					.object({
						label: z.string().trim().min(1).max(120),
						value: z.string().max(500)
					})
					.strict()
			)
			.max(100)
			.optional()
	})
	.strict()
	.superRefine((control, context) => {
		if (control.type === 'select' && !control.options?.length) {
			context.addIssue({ code: 'custom', message: 'select controls require options', path: ['options'] })
		}
		if (control.defaultValue !== undefined) {
			const validDefault =
				control.type === 'number'
					? typeof control.defaultValue === 'number'
					: typeof control.defaultValue === 'string'
			if (!validDefault) {
				context.addIssue({
					code: 'custom',
					message: `${control.type} control has an invalid defaultValue`,
					path: ['defaultValue']
				})
			}
		}
		if (
			control.type === 'select' &&
			control.defaultValue !== undefined &&
			control.defaultValue !== null &&
			!control.options?.some((option) => option.value === control.defaultValue)
		) {
			context.addIssue({
				code: 'custom',
				message: 'select defaultValue must match an option',
				path: ['defaultValue']
			})
		}
	})

export const DataXLiveArtifactManifestSchema = z
	.object({
		version: z.literal(1),
		bindings: z.array(BindingSchema).min(1).max(24),
		controls: z.array(ControlSchema).max(24).optional(),
		cacheTtlSeconds: z.number().int().min(0).max(300).optional()
	})
	.strict()
	.superRefine((manifest, context) => {
		for (const [field, values] of [
			['bindings', manifest.bindings.map((binding) => binding.id)],
			['controls', (manifest.controls ?? []).map((control) => control.id)]
		] as const) {
			const duplicate = values.find((value, index) => values.indexOf(value) !== index)
			if (duplicate) {
				context.addIssue({ code: 'custom', message: `Duplicate ${field} id '${duplicate}'`, path: [field] })
			}
		}
		const controlIds = new Set((manifest.controls ?? []).map((control) => control.id))
		for (const [bindingIndex, binding] of manifest.bindings.entries()) {
			for (const controlId of collectControlPlaceholders(binding.params)) {
				if (!controlIds.has(controlId)) {
					context.addIssue({
						code: 'custom',
						message: `Binding references undeclared control '${controlId}'`,
						path: ['bindings', bindingIndex, 'params']
					})
				}
			}
		}
	})

function collectControlPlaceholders(value: DataXLiveArtifactJsonValue): string[] {
	if (typeof value === 'string') {
		return Array.from(value.matchAll(CONTROL_PLACEHOLDER_PATTERN), (match) => match[1])
	}
	if (Array.isArray(value)) return value.flatMap(collectControlPlaceholders)
	if (value && typeof value === 'object') return Object.values(value).flatMap(collectControlPlaceholders)
	return []
}

const HtmlPathSchema = z
	.string()
	.trim()
	.min(1)
	.max(1000)
	.describe('HTML file path in the current Agent workspace, usually /workspace/<name>.html')

const DraftFields = {
	title: z.string().trim().min(1).max(255),
	description: z.string().trim().max(1000).optional(),
	htmlPath: HtmlPathSchema,
	manifest: DataXLiveArtifactManifestSchema,
	changeSummary: z.string().trim().min(1).max(500).optional()
}

export const ValidateLiveArtifactSchema = z.object(DraftFields).strict()

export const CreateLiveArtifactSchema = z
	.object({
		...DraftFields,
		draftId: z.string().uuid().optional()
	})
	.strict()

export const UpdateLiveArtifactSchema = z
	.object({
		...DraftFields,
		draftId: z.string().uuid(),
		baseVersionId: z.string().uuid()
	})
	.strict()

export const OpenLiveArtifactSchema = z
	.object({
		artifactId: z.string().uuid(),
		artifactVersionId: z.string().uuid().optional()
	})
	.strict()

export type ValidateLiveArtifactInput = z.infer<typeof ValidateLiveArtifactSchema>
export type CreateLiveArtifactInput = z.infer<typeof CreateLiveArtifactSchema>
export type UpdateLiveArtifactInput = z.infer<typeof UpdateLiveArtifactSchema>
export type OpenLiveArtifactInput = z.infer<typeof OpenLiveArtifactSchema>
