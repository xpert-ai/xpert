import { appPlatformDefinitionSchema, appPlatformEnvironmentSchema } from '@xpert-ai/contracts'
import { z } from 'zod/v3'

// Previous persisted definitions used an Assistant allowlist. Empty lists keep the App disabled;
// nonempty lists now use the installed App's complete suite. New configuration files reject this field.
const storedApp = z.object({
    enabled: z.boolean().optional(),
    entries: z.array(z.string().regex(/^(assistant|role:[a-z0-9_-]+)$/)).max(32).optional()
}).passthrough().transform(({ entries, ...app }) => ({
    ...app, enabled: app.enabled ?? (entries === undefined || entries.length > 0)
}))

export const platformConfigurationSnapshotSchema = z.object({
    definition: z.object({ apps: z.array(storedApp) }).passthrough().pipe(appPlatformDefinitionSchema),
    environment: appPlatformEnvironmentSchema,
    digest: z.string().regex(/^[a-f0-9]{64}$/)
}).strict()
