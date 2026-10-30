import { z } from 'zod/v3'

export const applicationInstallationScopeSchema = z.enum(['organization', 'personal', 'tenant']).optional()
export const applicationScopeQuerySchema = z.object({ installationScope: applicationInstallationScopeSchema }).strict()
export const applicationDetailQuerySchema = applicationScopeQuerySchema.extend({
    pluginName: z.string().trim().min(1).max(255),
    appName: z.string().trim().min(1).max(255)
})
export type ApplicationScopeQuery = z.output<typeof applicationScopeQuerySchema>
export type ApplicationDetailQuery = z.output<typeof applicationDetailQuerySchema>
