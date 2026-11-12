jest.mock('../installation/plugin-resource-installer.service', () => ({
    PluginResourceInstallerService: class PluginResourceInstallerService {}
}))
jest.mock('@xpert-ai/plugin-sdk', () => ({
    ...jest.requireActual('@xpert-ai/plugin-sdk'),
    get RequestContext() {
        return jest.requireMock('@xpert-ai/server-core').RequestContext
    },
    describeXpertToolProvider: jest.fn(() => ({
        options: {
            provider: 'decorated',
            componentKey: 'decorated-tools',
            name: 'Decorated tools',
            slug: 'legacy-client-specific-slug',
            defaultMiddleware: 'decorated',
            middlewares: [{ provider: 'decorated', meta: {} }]
        },
        tools: [{ propertyKey: 'read', options: { mcp: {} }, middlewareProvider: null }]
    }))
}))
jest.mock('../plugin-resource-installation.entity', () => ({
    PluginResourceInstallation: class PluginResourceInstallation {}
}))
jest.mock('../../mcp-publication/mcp-api-key.service', () => ({ McpApiKeyService: class McpApiKeyService {} }))
jest.mock('../../mcp-publication/mcp-capability-catalog.service', () => ({
    McpCapabilityCatalogService: class McpCapabilityCatalogService {}
}))
jest.mock('../../mcp-publication/mcp-publication.service', () => ({
    McpPublicationService: class McpPublicationService {}
}))
jest.mock('../../mcp-publication/mcp-publication-access.service', () => ({
    McpPublicationAccessService: class McpPublicationAccessService {}
}))
jest.mock('../../mcp-publication/entities/mcp-publication.entity', () => ({
    McpPublication: class McpPublication {}
}))
jest.mock('../../mcp-publication/mcp-publication-runtime.service', () => ({
    mcpCapabilityProviderInstructions: jest.fn(() => undefined),
    mcpPublicationInstructions: jest.fn((instructions: string | undefined) => instructions)
}))

let mockOrganizationId: string | null = 'org-1'

jest.mock('@xpert-ai/server-core', () => {
    const actual = {
        ...jest.requireActual('../../../../server/src/plugin/types'),
        ...jest.requireActual('../../../../server/src/plugin/plugin-bundle-manifest')
    }
    return {
        ...actual,
        canManageGlobalPlugins: jest.fn(() => true),
        RequestContext: {
            getOrganizationId: jest.fn(() => mockOrganizationId),
            currentTenantId: jest.fn(() => 'tenant-1'),
            getScope: jest.fn(() => ({ tenantId: 'tenant-1', organizationId: mockOrganizationId })),
            currentRequest: jest.fn(() => null),
            currentUser: jest.fn(() => ({ id: 'user-1', tenantId: 'tenant-1' })),
            getLanguageCode: jest.fn(() => 'en-US')
        }
    }
})

jest.mock('../../shared/request-context', () => ({
    captureRequestContext: jest.fn((context) => context),
    runWithCapturedRequestContext: jest.fn(async (context, task) => {
        const previous = mockOrganizationId
        mockOrganizationId = context.organizationId ?? null
        try {
            return await task()
        } finally {
            mockOrganizationId = previous
        }
    })
}))

import { StrategyBus } from '@xpert-ai/plugin-sdk'
import { PluginMcpServerService } from './plugin-mcp-server.service'

import type { LoadedPluginRecord } from '@xpert-ai/server-core'
import { PreparePluginTestAccessHandler } from '../commands/handlers/prepare-plugin-test-access.handler'
import { PreparePluginTestAccessCommand } from '../commands/prepare-plugin-test-access.command'

describe('bounded plugin test access', () => {
    const expected = { scopeKey: 'org-1', runtimeRevision: 'runtime:approved', packageVersion: '1.0.0', sha256: 'a'.repeat(64) }
    const publication = { id: 'publication-1', tenantId: 'tenant-1', organizationId: 'org-1', status: 'active' }
    let loaded: LoadedPluginRecord
    let service: PluginMcpServerService
    const createRevealable = jest.fn(), createRevealableForOrganization = jest.fn(), issue = jest.fn(), activate = jest.fn()
    let beforeIssue: (() => void) | undefined
    beforeEach(() => {
        jest.clearAllMocks(); beforeIssue = undefined
        loaded = { name: '@fixture/approved', source: 'code', scopeKey: 'org-1', tenantId: 'tenant-1', organizationId: 'org-1', ctx: {},
            sourceConfig: { runtimeName: 'approved', archiveSha256: expected.sha256 },
            instance: { meta: { name: '@fixture/approved', level: 'organization', artifactNamespace: 'approved', version: '1.0.0' } } }
        issue.mockImplementation(async (_publication: unknown, organizationId: string, input: { expiresAt: Date; scopes: string[] }) => {
            beforeIssue?.()
            return { apiKey: { id: 'key-1', organizationId, expiresAt: input.expiresAt }, secret: 'bounded-test-secret' }
        })
        service = new PluginMcpServerService(
            {} as never, {} as never, {} as never,
            { getManaged: jest.fn(async () => publication) } as never,
            { getOrCreateRevealableCredential: issue, listForOrganization: jest.fn(async () => []),
                createRevealable, createRevealableForOrganization } as never,
            { isEnabled: jest.fn(), enable: jest.fn(), disable: jest.fn() } as never,
            {} as never, new StrategyBus(),
            { listRegistrations: jest.fn(() => [{ strategy: {}, source: { kind: 'plugin', pluginName: '@fixture/approved', scopeKey: 'org-1' } }]) } as never,
            [loaded]
        )
        activate.mockResolvedValue({ publication, installation: {}, name: 'Approved', clientScopes: ['tools:list', 'tools:call'], rollback: {} })
        Reflect.set(service, 'activateProvider', activate)
        Reflect.set(service, 'connectionInfoFor', jest.fn(async () => ({ endpoint: 'https://platform.example/api/mcp/p/approved' })))
    })
    it('creates only a two-hour tools credential scoped to the current publication and organization', async () => {
        const before = Date.now()
        const handler = new PreparePluginTestAccessHandler(service)
        const result = await handler.execute(new PreparePluginTestAccessCommand('@fixture/approved', 'decorated-tools', 'operation-1', expected))
        expect(createRevealable).not.toHaveBeenCalled()
        expect(createRevealableForOrganization).not.toHaveBeenCalled()
        expect(issue).toHaveBeenCalledWith(publication, 'org-1', expect.objectContaining({
            name: 'delivery-test:operation-1', scopes: ['tools:list', 'tools:call']
        }))
        expect(new Date(result.expiresAt).getTime()).toBeGreaterThanOrEqual(before + 2 * 60 * 60 * 1000)
        expect(new Date(result.expiresAt).getTime()).toBeLessThanOrEqual(Date.now() + 2 * 60 * 60 * 1000)
        expect(result).toMatchObject({ publicationId: publication.id, secret: 'bounded-test-secret' })
    })
    it.each(['scope', 'source', 'runtime', 'digest', 'version'] as const)('rejects a changed loaded %s before activation', async kind => {
        if (kind === 'scope') loaded.scopeKey = 'other-org'
        if (kind === 'source') loaded.source = 'npm'
        if (kind === 'runtime') loaded.sourceConfig.runtimeName = 'old-runtime'
        if (kind === 'digest') loaded.sourceConfig.archiveSha256 = 'b'.repeat(64)
        if (kind === 'version') loaded.instance.meta.version = '2.0.0'
        await expect(service.prepareTestAccess('@fixture/approved', 'decorated-tools', 'operation-1', expected)).rejects.toThrow()
        expect(activate).not.toHaveBeenCalled(); expect(issue).not.toHaveBeenCalled()
    })
    it('rejects a runtime change while the publication is being activated', async () => {
        activate.mockImplementationOnce(async () => {
            loaded.sourceConfig.runtimeName = 'replacement'
            return { publication, installation: {}, name: 'Approved', clientScopes: [], rollback: {} }
        })
        await expect(service.prepareTestAccess('@fixture/approved', 'decorated-tools', 'operation-1', expected)).rejects.toMatchObject({ status: 409 })
        expect(issue).not.toHaveBeenCalled()
    })
    it('does not deliver a credential if the runtime changes while it is being issued', async () => {
        beforeIssue = () => { loaded.sourceConfig.archiveSha256 = 'b'.repeat(64) }
        await expect(service.prepareTestAccess('@fixture/approved', 'decorated-tools', 'operation-1', expected)).rejects.toMatchObject({ status: 409 })
    })
})
