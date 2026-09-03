import { ForbiddenException } from '@nestjs/common'
import { environment, type ConfigService } from '@xpert-ai/server-config'
import type { McpApiKeyService } from './mcp-api-key.service'
import type { McpCapabilityCatalogService } from './mcp-capability-catalog.service'
import type { McpInvocationAuditService } from './mcp-invocation-audit.service'
import type { McpOAuthService } from './mcp-oauth.service'
import { McpPublicationManagementController } from './mcp-publication-management.controller'
import type { McpPublicationService } from './mcp-publication.service'

describe('McpPublicationManagementController', () => {
    const defaultMcpOAuthEnabled = environment.mcpOAuthEnabled

    afterEach(() => {
        environment.mcpOAuthEnabled = defaultMcpOAuthEnabled
    })

    it('manages publications from the current tenant or organization scope without a workspace route', async () => {
        const publications = {
            create: jest.fn().mockResolvedValue({ id: 'publication-1' }),
            list: jest.fn().mockResolvedValue([{ id: 'publication-1' }])
        } as unknown as McpPublicationService
        const controller = new McpPublicationManagementController(
            publications,
            {} as McpApiKeyService,
            {} as McpInvocationAuditService,
            {} as McpOAuthService,
            {} as McpCapabilityCatalogService
        )
        const create = controller.create as unknown as (input: { name: string; slug: string }) => Promise<unknown>
        const list = controller.list as unknown as () => Promise<unknown>
        const input = { name: 'Platform MCP', slug: 'platform-mcp' }

        await expect(create.call(controller, input)).resolves.toEqual({ id: 'publication-1' })
        await expect(list.call(controller)).resolves.toEqual([{ id: 'publication-1' }])
        expect(publications.create).toHaveBeenCalledWith(input)
        expect(publications.list).toHaveBeenCalledWith()
    })

    it('uses the trusted API base URL for connection information', async () => {
        const publications = {
            getManaged: jest.fn().mockResolvedValue({
                slug: 'generic/mcp',
                protocolVersion: '2026-07-28',
                instructions: 'Use the published capabilities.',
                capabilities: []
            }),
            resolveRuntimeCapabilities: jest.fn().mockResolvedValue([
                {
                    descriptorSnapshot: {
                        providerInstructions: 'Prefer resources before tools.',
                        source: { toolsetId: 'toolset-1', pluginName: '@xpert-ai/plugin-generic' }
                    }
                }
            ])
        } as unknown as McpPublicationService
        const configService = {
            get: jest.fn((key: string) => (key === 'baseUrl' ? 'https://api.xpert.example/base' : undefined))
        } as unknown as ConfigService
        const controller = new McpPublicationManagementController(
            publications,
            {} as McpApiKeyService,
            {} as McpInvocationAuditService,
            {} as McpOAuthService,
            {} as McpCapabilityCatalogService,
            configService
        )

        await expect(controller.connectionInfo('publication-1')).resolves.toEqual({
            protocolVersion: '2026-07-28',
            transport: 'streamable-http',
            endpoint: 'https://api.xpert.example/api/mcp/p/generic%2Fmcp',
            authorization: 'Bearer',
            serverInstructions: expect.stringMatching(
                /Xpert-managed MCP publication[\s\S]*Publication instructions:\nUse the published capabilities\.[\s\S]*\[@xpert-ai\/plugin-generic\]\nPrefer resources before tools\./
            )
        })
        expect(publications.getManaged).toHaveBeenCalledWith('publication-1', ['capabilities'])
    })

    it('rejects OAuth management in the open-source distribution', () => {
        environment.mcpOAuthEnabled = false
        const oauth = { getManaged: jest.fn() } as unknown as McpOAuthService
        const controller = new McpPublicationManagementController(
            {} as McpPublicationService,
            {} as McpApiKeyService,
            {} as McpInvocationAuditService,
            oauth,
            {} as McpCapabilityCatalogService
        )

        expect(() => controller.oauthPolicy('publication-1')).toThrow(ForbiddenException)
        expect(oauth.getManaged).not.toHaveBeenCalled()
    })

    it('returns the requested audit page after checking publication access', async () => {
        const publications = {
            getManaged: jest.fn().mockResolvedValue({ id: 'publication-1' })
        } as unknown as McpPublicationService
        const audit = {
            search: jest.fn().mockResolvedValue({ items: [], total: 21 })
        } as unknown as McpInvocationAuditService
        const controller = new McpPublicationManagementController(
            publications,
            {} as McpApiKeyService,
            audit,
            {} as McpOAuthService,
            {} as McpCapabilityCatalogService
        )

        await expect(controller.auditLog('publication-1', '10', '20')).resolves.toEqual({ items: [], total: 21 })
        expect(publications.getManaged).toHaveBeenCalledWith('publication-1')
        expect(audit.search).toHaveBeenCalledWith('publication-1', 20, 10, undefined)
    })
})
