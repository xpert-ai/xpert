// The SDK may resume a legacy tool inside the original HTTP call after elicitation.
// Authenticate again on that path; a retained connection never grants retained access.
import type { McpPrincipal } from '@xpert-ai/contracts'
import { ForbiddenException } from '@nestjs/common'
import type { McpPublication, McpPublicationCapability } from './entities'
import type { McpAuthenticationService } from './mcp-authentication.service'
import type { McpPublicationAuthorizationService } from './mcp-publication-authorization.service'
import type { McpPublicationService } from './mcp-publication.service'
import { legacySessionSnapshot, type LegacyRequestContext } from './mcp-legacy-sessions'
import type { McpInvocationAuditService, StartMcpAuditInput } from './mcp-invocation-audit.service'
import { canExposeCapability, compareRuntimeCapabilities } from './mcp-runtime-protocol'

export function legacyPublicationContext(input: {
    publication: McpPublication
    principal: McpPrincipal
    capabilities: McpPublicationCapability[]
    authorization: string | undefined
    requestId: string
    traceId: string
    publications: Pick<McpPublicationService, 'findActiveBySlug' | 'resolveRuntimeCapabilities'>
    authentication: Pick<McpAuthenticationService, 'authenticate'>
    publicationAuthorization: Pick<McpPublicationAuthorizationService, 'assertCanRun'>
}) {
    const snapshot = publicationSnapshot(input.publication, input.principal, input.capabilities)
    return {
        snapshot,
        binding: legacySessionSnapshot(input.publication.id, principalSnapshot(input.principal)),
        context: {
            requestId: input.requestId,
            traceId: input.traceId,
            revalidate: async () => {
                const current = await input.publications.findActiveBySlug(input.publication.slug)
                const caller = await input.authentication.authenticate(current, input.authorization)
                await input.publicationAuthorization.assertCanRun(current, caller)
                const allowed = (await input.publications.resolveRuntimeCapabilities(current))
                    .filter((item) => canExposeCapability(caller, item))
                    .sort(compareRuntimeCapabilities)
                if (publicationSnapshot(current, caller, allowed) !== snapshot) throw new ForbiddenException()
            }
        }
    }
}

export function startLegacyInvocationAudit(
    context: LegacyRequestContext | undefined,
    service: Pick<McpInvocationAuditService, 'start'>,
    input: StartMcpAuditInput
) {
    // The legacy shim invokes the same tool again within one HTTP request after input.
    // Keep its audit identity, rather than inserting the same unique requestId twice.
    if (!context) return service.start(input)
    return (context.invocationAudit ??= service.start(input))
}

// Sign execution settings, not ORM relation order or row audit timestamps.
function publicationSnapshot(
    publication: McpPublication,
    principal: McpPrincipal,
    capabilities: McpPublicationCapability[]
) {
    return legacySessionSnapshot(
        {
            id: publication.id,
            tenantId: publication.tenantId,
            organizationId: publication.organizationId ?? null,
            slug: publication.slug,
            name: publication.name,
            status: publication.status,
            authMethods: [...(publication.authMethods ?? [])].sort(),
            protocolVersion: publication.protocolVersion,
            instructions: publication.instructions ?? null,
            runtime: publication.runtime ?? null,
            reviewStatus: publication.reviewStatus
        },
        principalSnapshot(principal),
        [...capabilities]
            .sort((left, right) => left.id.localeCompare(right.id))
            .map((binding) => ({
                id: binding.id,
                tenantId: binding.tenantId,
                organizationId: binding.organizationId ?? null,
                publicationId: binding.publicationId,
                toolsetId: binding.toolsetId,
                capabilityType: binding.capabilityType,
                capabilityKey: binding.capabilityKey,
                publicName: binding.publicName,
                enabled: binding.enabled,
                policy: binding.policy ?? null,
                descriptorHash: binding.descriptorHash,
                descriptorSnapshot: binding.descriptorSnapshot,
                pluginVersion: binding.pluginVersion ?? null
            }))
    )
}

function principalSnapshot(principal: McpPrincipal): McpPrincipal {
    return { ...principal, scopes: [...principal.scopes].sort() }
}
