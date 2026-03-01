import { z } from 'zod'

export const DEFAULT_STREAM_UPDATE_WINDOW_MS = 2000
export const MIN_STREAM_UPDATE_WINDOW_MS = 100
export const MAX_STREAM_UPDATE_WINDOW_MS = 10000

export const IntegrationLarkPluginConfigSchema = z.object({
	streaming: z
		.object({
			updateWindowMs: z
				.coerce.number()
				.int()
				.min(MIN_STREAM_UPDATE_WINDOW_MS)
				.max(MAX_STREAM_UPDATE_WINDOW_MS)
				.default(DEFAULT_STREAM_UPDATE_WINDOW_MS)
		})
		.default({})
})

export type IntegrationLarkPluginConfig = z.infer<typeof IntegrationLarkPluginConfigSchema>
