import { z } from 'zod/v3'

export const latestPluginVersionsSchema = z
	.object({
		names: z.array(z.string().trim().min(1).max(214)).max(200).optional(),
		forceRefresh: z.boolean().optional()
	})
	.strict()
	.default({})
export type LatestPluginVersionsInput = z.output<typeof latestPluginVersionsSchema>
