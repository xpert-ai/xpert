import { z } from 'zod/v3'

export const connectorOAuthLaunchQuerySchema = z.object({
    ticket: z.string().regex(/^[a-f0-9]{64}$/)
}).strict()
export type ConnectorOAuthLaunchQuery = z.output<typeof connectorOAuthLaunchQuerySchema>
