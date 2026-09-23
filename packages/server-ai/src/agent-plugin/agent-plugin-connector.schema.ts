import { z } from 'zod/v3'

const scopes = z.array(z.string().trim().min(1).max(200)).max(100).optional()
export const agentPluginConnectorSchema = z.discriminatedUnion('type', [
    z
        .object({
            type: z.literal('mcp_oauth'),
            scopes,
            clientRegistration: z.enum(['dynamic', 'preregistered']).optional()
        })
        .strict(),
    z
        .object({
            type: z.literal('existing'),
            provider: z.string().trim().min(1).max(191),
            resource: z.string().url(),
            scopes
        })
        .strict()
])

export const agentPluginConnectorsSchema = z.record(agentPluginConnectorSchema)
