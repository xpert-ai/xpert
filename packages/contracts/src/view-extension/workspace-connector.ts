import { z } from 'zod/v3'

const authorizationFields = {
  authMethodId: z.string().trim().min(1).max(128).optional(),
  integrationId: z.string().uuid().optional()
}
const hasIntegrationMethod = (value: { authMethodId?: string; integrationId?: string }) =>
  !value.integrationId || !!value.authMethodId

/** An integration reference must name the Connector authentication method that consumes it. */
export const workspaceConnectorAuthorizationSchema = z.object(authorizationFields).strict().refine(hasIntegrationMethod)
export type WorkspaceConnectorAuthorization = z.infer<typeof workspaceConnectorAuthorizationSchema>

/** Intent only: the host resolves workspace identity, permissions and available Connector definitions. */
export const workspaceConnectorConnectPayloadSchema = z
  .object({
    provider: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
    ...authorizationFields
  })
  .strict()
  .refine(hasIntegrationMethod)
export type WorkspaceConnectorConnectPayload = z.infer<typeof workspaceConnectorConnectPayloadSchema>
