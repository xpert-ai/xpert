import { ForbiddenException } from '@nestjs/common'
import { ConfigService, environment } from '@xpert-ai/server-config'
import { McpOAuthMetadataController } from './mcp-oauth-metadata.controller'
import { McpOAuthService } from './mcp-oauth.service'
import { McpPublicationService } from './mcp-publication.service'
import { McpPublication } from './entities'

describe('McpOAuthMetadataController', () => {
    const defaultMcpOAuthEnabled = environment.mcpOAuthEnabled

    beforeEach(() => {
        environment.mcpOAuthEnabled = true
    })

    afterEach(() => {
        environment.mcpOAuthEnabled = defaultMcpOAuthEnabled
    })

    it('uses the trusted API base URL for protected resource metadata', async () => {
        const publication = Object.assign(new McpPublication(), { id: 'publication-1', slug: 'generic' })
        const publications = {
            findActiveBySlug: jest.fn().mockResolvedValue(publication)
        } as unknown as McpPublicationService
        const oauth = {
            protectedResourceMetadata: jest.fn().mockResolvedValue({ resource: 'ok' })
        } as unknown as McpOAuthService
        const configService = {
            get: jest.fn((key: string) => (key === 'baseUrl' ? 'https://api.xpert.example/base' : undefined))
        } as unknown as ConfigService
        const controller = new McpOAuthMetadataController(publications, oauth, configService)

        await controller.metadata('generic')

        expect(oauth.protectedResourceMetadata).toHaveBeenCalledWith(
            publication,
            'https://api.xpert.example/api/mcp/p/generic'
        )
    })

    it('does not expose OAuth metadata in the open-source distribution', async () => {
        environment.mcpOAuthEnabled = false
        const publications = {
            findActiveBySlug: jest.fn()
        } as unknown as McpPublicationService
        const controller = new McpOAuthMetadataController(publications, {} as McpOAuthService, {} as ConfigService)

        await expect(controller.metadata('generic')).rejects.toBeInstanceOf(ForbiddenException)
        expect(publications.findActiveBySlug).not.toHaveBeenCalled()
    })
})
