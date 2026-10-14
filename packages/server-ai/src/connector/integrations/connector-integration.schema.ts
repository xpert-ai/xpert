import { z } from 'zod/v3'
import type { ConnectorIntegrationRequest } from '@xpert-ai/plugin-sdk'

export const connectorBindingIdSchema = z.string().uuid()
export const connectorIntegrationQuerySchema = z
    .object({
        workspaceId: z.string().uuid(),
        provider: z.string().trim().min(1).max(200),
        authMethodId: z.string().trim().min(1).max(100)
    })
    .strict()
export const connectorIntegrationRequestSchema = z
    .object({
        authMethodId: z.string().trim().min(1).max(100),
        selection: z.discriminatedUnion('type', [
            z.object({ type: z.literal('existing'), integrationId: z.string().uuid() }).strict(),
            z
                .object({
                    type: z.literal('new'),
                    requestId: z.string().uuid(),
                    name: z.string().trim().min(1).max(100),
                    values: z.record(z.string().max(10000))
                })
                .strict()
        ])
    })
    .strict()
    .transform(
        (input): ConnectorIntegrationRequest => ({
            authMethodId: input.authMethodId,
            selection:
                input.selection.type === 'existing'
                    ? { type: 'existing', integrationId: input.selection.integrationId }
                    : {
                          type: 'new',
                          requestId: input.selection.requestId,
                          name: input.selection.name,
                          values: input.selection.values
                      }
        })
    )
export type ConnectorIntegrationQuery = z.output<typeof connectorIntegrationQuerySchema>
export type ConnectorIntegrationInput = z.output<typeof connectorIntegrationRequestSchema>
