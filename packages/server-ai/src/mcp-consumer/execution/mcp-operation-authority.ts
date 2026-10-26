import { AsyncLocalStorage } from 'node:async_hooks'
import { Query } from '@nestjs/cqrs'
import { z } from 'zod/v3'
import type { McpOperationAuthority, McpPrincipal } from '@xpert-ai/contracts'

const principalSchema = z
    .object({
        authMethod: z.enum(['api_key', 'oauth']),
        subjectType: z.enum(['user', 'service_account']),
        subjectId: z.string().min(1),
        userId: z.string().uuid().optional(),
        clientId: z.string().optional(),
        tenantId: z.string().uuid(),
        organizationId: z.string().uuid().optional(),
        publicationId: z.string().uuid(),
        scopes: z.array(z.string())
    })
    .strip()
export type { McpOperationAuthority } from '@xpert-ai/contracts'
export const mcpOperationAuthoritySchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('workspace') }).strict(),
    z
        .object({ kind: z.literal('assistant'), xpertId: z.string().uuid(), projectId: z.string().uuid().optional() })
        .strict(),
    z.object({ kind: z.literal('publication'), principal: principalSchema }).strict()
]) as z.ZodType<McpOperationAuthority>
const publicationAuthority = new AsyncLocalStorage<McpOperationAuthority>()
/** The publication boundary supplies the authenticated principal; never accept this grant from tool arguments. */
export function withMcpPublicationAuthority<T>(principal: McpPrincipal, work: () => T): T {
    return publicationAuthority.run(
        { kind: 'publication', principal: { ...principal, scopes: [...principal.scopes] } },
        work
    )
}
export function currentMcpPublicationAuthority() {
    return publicationAuthority.getStore()
}
/** Recheck the original business grant; authoring membership is not an Assistant/Publication runtime grant. */
export class AuthorizeAssistantMcpQuery extends Query<void> {
    constructor(
        readonly xpertId: string,
        readonly workspaceId: string,
        readonly projectId?: string
    ) {
        super()
    }
}
export class AuthorizePublicationMcpQuery extends Query<void> {
    constructor(
        readonly principal: McpPrincipal,
        readonly toolsetId: string,
        readonly serverName: string,
        readonly toolName: string
    ) {
        super()
    }
}
