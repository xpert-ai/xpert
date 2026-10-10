import { z } from 'zod/v3'
import { PLUGIN_MARKETPLACE_CATEGORIES } from '@xpert-ai/contracts'

export const setupPluginsCatalogQuery = z
	.object({
		page: z.coerce.number().int().min(1).default(1),
		pageSize: z.coerce.number().int().min(1).max(48).default(12),
		search: z.string().trim().max(200).optional(),
		type: z.string().min(1).max(100).optional(),
		businessCategory: z.enum(PLUGIN_MARKETPLACE_CATEGORIES).optional(),
		level: z.enum(['system', 'tenant', 'organization']).optional(),
		groupBy: z.enum(['none', 'type', 'business']).default('none')
	})
	.strict()

export const setupPluginsInput = z
	.object({
		plugins: z.array(z.string().min(1).max(200)).max(5000),
		importDefaultAgentPlugins: z.boolean().default(true)
	})
	.strict()

export const setupPluginProgress = z.object({
	phase: z.enum(['idle', 'installing', 'restarting', 'completed', 'attention']),
	items: z.array(
		z.object({
			packageName: z.string(),
			title: z.union([z.string(), z.record(z.string())]),
			level: z.enum(['system', 'tenant', 'organization']).optional(),
			version: z.string().optional(),
			status: z.enum(['pending', 'installing', 'installed', 'existing', 'failed']),
			error: z.string().optional(),
			runtimeRequirements: z.array(
				z.object({
					scopeKey: z.string(),
					pluginName: z.string(),
					version: z.string().optional(),
					runtimeRevision: z.string().optional(),
					state: z.enum(['loaded', 'absent'])
				})
			)
		})
	),
	defaultAgentPlugins: z
		.object({
			status: z.enum(['pending', 'importing', 'completed', 'failed']),
			result: z
				.object({
					commit: z.string(),
					items: z.array(
						z.object({
							id: z.string(),
							status: z.enum(['imported', 'existing', 'failed']),
							packageId: z.string().optional(),
							title: z.string().optional(),
							diagnosticCount: z.number().int().min(0).optional(),
							error: z.string().optional()
						})
					)
				})
				.optional(),
			error: z.string().optional()
		})
		.optional(),
	organizationId: z.string().nullable().optional(),
	updatedAt: z.string(),
	restartId: z.string().optional(),
	generation: z.number().optional(),
	error: z.string().optional()
})
