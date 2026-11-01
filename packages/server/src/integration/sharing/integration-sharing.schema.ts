import { z } from 'zod'

export const integrationUsageSchema = z.enum(['configuration', 'invoke', 'bind'])
export const integrationSharingSchema = z
	.object({
		visibility: z.enum(['private', 'all-organizations', 'selected-organizations']),
		organizationIds: z.array(z.string().uuid()).max(1000).default([]),
		usages: z.array(integrationUsageSchema).max(3).default([])
	})
	.strict()
	.superRefine((value, ctx) => {
		if (value.visibility === 'selected-organizations' && !value.organizationIds.length)
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['organizationIds'],
				message: 'Select at least one organization'
			})
		if (value.visibility !== 'selected-organizations' && value.organizationIds.length)
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['organizationIds'],
				message: 'Organization IDs require selected-organizations'
			})
		if (value.visibility !== 'private' && !value.usages.length)
			ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['usages'], message: 'Select at least one usage' })
		if (
			new Set(value.organizationIds).size !== value.organizationIds.length ||
			new Set(value.usages).size !== value.usages.length
		)
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Duplicate grants are not allowed' })
	})

export const integrationConsumptionQuerySchema = z
	.object({
		provider: z.string().min(1).max(200).optional(),
		features: z.string().max(500).optional(),
		usage: integrationUsageSchema.default('invoke')
	})
	.strict()
