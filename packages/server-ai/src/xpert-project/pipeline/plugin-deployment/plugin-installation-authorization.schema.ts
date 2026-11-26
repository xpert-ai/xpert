import { z } from 'zod/v3'

export const projectPluginInstallationAuthorizationSchema = z
    .object({
        operationId: z.string().uuid(),
        actorId: z.string().uuid(),
        bindingDigest: z.string().min(1),
        authorizedAt: z.string().datetime()
    })
    .strict()
export type ProjectPluginInstallationAuthorization = z.output<typeof projectPluginInstallationAuthorizationSchema>

export const installationAuthorizationRefSchema = z
    .object({ id: z.string().uuid(), actorId: z.string().uuid(), digest: z.string().min(1) })
    .strict()
export type InstallationAuthorizationRef = z.output<typeof installationAuthorizationRefSchema>
