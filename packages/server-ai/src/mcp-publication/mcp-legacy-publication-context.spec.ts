import { MCP_PROTOCOL_VERSION, type McpPrincipal } from '@xpert-ai/contracts'
import { McpInvocationAudit, McpPublication, McpPublicationCapability } from './entities'
import { legacyPublicationContext, startLegacyInvocationAudit } from './mcp-legacy-publication-context'

// A confirmation reply must not revive a disabled publication or revoked caller.
describe('legacyPublicationContext', () => {
    const publication = Object.assign(new McpPublication(), {
        id: 'publication-1',
        slug: 'cut',
        status: 'active',
        protocolVersion: MCP_PROTOCOL_VERSION
    })
    const principal: McpPrincipal = {
        authMethod: 'api_key',
        subjectType: 'user',
        subjectId: 'user-1',
        userId: 'user-1',
        tenantId: 'tenant-1',
        publicationId: 'publication-1',
        scopes: ['*']
    }

    function fixture() {
        const publications = {
            findActiveBySlug: jest.fn().mockResolvedValue(publication),
            resolveRuntimeCapabilities: jest.fn().mockResolvedValue([])
        }
        const authentication = { authenticate: jest.fn().mockResolvedValue(principal) }
        const publicationAuthorization = { assertCanRun: jest.fn() }
        const input = {
            publication,
            principal,
            capabilities: [],
            authorization: 'Bearer original-key',
            requestId: 'request-2',
            traceId: 'trace-2',
            publications,
            authentication,
            publicationAuthorization
        }
        return { input, bound: legacyPublicationContext(input) }
    }

    it('reauthenticates the original credential and checks current access on every resume', async () => {
        const { input, bound } = fixture()
        await bound.context.revalidate()
        expect(input.authentication.authenticate).toHaveBeenCalledWith(publication, 'Bearer original-key')
        expect(input.publicationAuthorization.assertCanRun).toHaveBeenCalledWith(publication, principal)
        expect(input.publications.resolveRuntimeCapabilities).toHaveBeenCalledWith(publication)
        expect(bound.context.requestId).toBe('request-2')
    })

    it('rejects credential revocation while awaiting confirmation', async () => {
        const { input, bound } = fixture()
        input.authentication.authenticate.mockRejectedValue(new Error('Revoked'))
        await expect(bound.context.revalidate()).rejects.toThrow('Revoked')
    })

    it('rejects membership revocation while awaiting confirmation', async () => {
        const { input, bound } = fixture()
        input.publicationAuthorization.assertCanRun.mockRejectedValue(new Error('Membership removed'))
        await expect(bound.context.revalidate()).rejects.toThrow('Membership removed')
    })

    it('rejects disabling or deleting the publication while awaiting confirmation', async () => {
        const { input, bound } = fixture()
        input.publications.findActiveBySlug.mockRejectedValue(new Error('Publication unavailable'))
        await expect(bound.context.revalidate()).rejects.toThrow('Publication unavailable')
    })

    it('rejects changed scopes and caller substitution', async () => {
        const { input, bound } = fixture()
        input.authentication.authenticate.mockResolvedValue({ ...principal, scopes: ['tools:list'] })
        await expect(bound.context.revalidate()).rejects.toThrow('Forbidden')
        input.authentication.authenticate.mockResolvedValue({ ...principal, subjectId: 'user-2' })
        await expect(bound.context.revalidate()).rejects.toThrow('Forbidden')
    })

    it('rejects changed runtime settings before consuming the accepted confirmation', async () => {
        const { input, bound } = fixture()
        input.publications.findActiveBySlug.mockResolvedValue({ ...publication, runtime: { version: 1 } })
        await expect(bound.context.revalidate()).rejects.toThrow('Forbidden')
    })
    it('keeps the session when relation, scope, and JSON property order changes', async () => {
        const { input } = fixture()
        const a = Object.assign(new McpPublicationCapability(), {
            id: 'a',
            enabled: true,
            capabilityType: 'resource',
            publicName: 'a',
            descriptorSnapshot: { capabilityType: 'resource', requiredContext: [] },
            policy: { timeoutMs: 100, rateLimit: { requests: 10, windowSeconds: 60 } }
        })
        const b = Object.assign(new McpPublicationCapability(), {
            id: 'b',
            enabled: true,
            capabilityType: 'resource',
            publicName: 'b',
            descriptorSnapshot: { capabilityType: 'resource', requiredContext: [] }
        })
        const initial = { ...publication, capabilities: [a, b] }
        const bound = legacyPublicationContext({
            ...input,
            publication: initial,
            capabilities: [a, b],
            principal: { ...principal, scopes: ['*', 'resources:read'] }
        })
        input.publications.findActiveBySlug.mockResolvedValue({ ...initial, capabilities: [b, a] })
        input.publications.resolveRuntimeCapabilities.mockResolvedValue([
            b,
            { ...a, policy: { rateLimit: { windowSeconds: 60, requests: 10 }, timeoutMs: 100 } }
        ])
        input.authentication.authenticate.mockResolvedValue({ ...principal, scopes: ['resources:read', '*'] })
        await expect(bound.context.revalidate()).resolves.toBeUndefined()
    })

    it('ignores row audit timestamps without weakening execution configuration checks', async () => {
        const { input, bound } = fixture()
        input.publications.findActiveBySlug.mockResolvedValue({
            ...publication,
            updatedAt: new Date('2026-09-14T00:00:00Z')
        })
        await expect(bound.context.revalidate()).resolves.toBeUndefined()
    })

    it.each(['files', 'model', 'policy', 'binding', 'descriptor'] as const)(
        'still rejects a real %s change after normalizing the snapshot',
        async (change) => {
            const { input } = fixture()
            const capability = Object.assign(new McpPublicationCapability(), {
                id: 'a',
                enabled: true,
                capabilityType: 'resource',
                publicName: 'a',
                descriptorSnapshot: { capabilityType: 'resource', requiredContext: [] },
                policy: { timeoutMs: 100 }
            })
            const bound = legacyPublicationContext({ ...input, capabilities: [capability] })
            input.publications.resolveRuntimeCapabilities.mockResolvedValue([capability])
            if (change === 'files')
                input.publications.findActiveBySlug.mockResolvedValue({
                    ...publication,
                    runtime: { files: { type: 'user' } }
                })
            if (change === 'model')
                input.publications.findActiveBySlug.mockResolvedValue({
                    ...publication,
                    runtime: { transcription: { type: 'model', copilotId: 'model-1', model: 'whisper' } }
                })
            if (change === 'policy')
                input.publications.resolveRuntimeCapabilities.mockResolvedValue([
                    { ...capability, policy: { timeoutMs: 200 } }
                ])
            if (change === 'descriptor')
                input.publications.resolveRuntimeCapabilities.mockResolvedValue([
                    { ...capability, descriptorHash: 'changed' }
                ])
            if (change === 'binding') input.publications.resolveRuntimeCapabilities.mockResolvedValue([])
            await expect(bound.context.revalidate()).rejects.toThrow('Forbidden')
        }
    )

    it('reuses one audit when the SDK resumes the same HTTP call after confirmation', async () => {
        const { input, bound } = fixture()
        const row = Object.assign(new McpInvocationAudit(), { id: 'audit-1', requestId: input.requestId })
        const service = { start: jest.fn().mockResolvedValue(row) }
        const first = await startLegacyInvocationAudit(bound.context, service, input)
        const resumed = await startLegacyInvocationAudit(bound.context, service, input)
        expect(first).toBe(resumed)
        expect(service.start).toHaveBeenCalledTimes(1)
        const nextRequest = legacyPublicationContext({ ...input, requestId: 'request-3' })
        await startLegacyInvocationAudit(nextRequest.context, service, { ...input, requestId: 'request-3' })
        expect(service.start).toHaveBeenCalledTimes(2)
    })

    it('keeps modern HTTP attempts independent and does not retry a failed audit insert', async () => {
        const { input, bound } = fixture()
        const service = { start: jest.fn().mockRejectedValue(new Error('Audit store unavailable')) }
        await expect(startLegacyInvocationAudit(bound.context, service, input)).rejects.toThrow(
            'Audit store unavailable'
        )
        await expect(startLegacyInvocationAudit(bound.context, service, input)).rejects.toThrow(
            'Audit store unavailable'
        )
        expect(service.start).toHaveBeenCalledTimes(1)
        await expect(startLegacyInvocationAudit(undefined, service, input)).rejects.toThrow('Audit store unavailable')
        expect(service.start).toHaveBeenCalledTimes(2)
    })
})
