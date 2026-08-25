import { Public } from '@xpert-ai/server-core'
import { ConfigService } from '@xpert-ai/server-config'
import { Controller, Get, Inject, Optional, Param } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { McpOAuthService } from './mcp-oauth.service'
import { McpPublicationService } from './mcp-publication.service'
import { mcpPublicationPublicUrl } from './mcp-publication-url'
import { assertMcpOAuthEnabled } from './mcp-oauth-feature'

@ApiTags('MCP OAuth metadata')
@Public()
@Controller('.well-known/oauth-protected-resource')
export class McpOAuthMetadataController {
    constructor(
        private readonly publications: McpPublicationService,
        private readonly oauth: McpOAuthService,
        @Optional() @Inject(ConfigService) private readonly configService?: ConfigService
    ) {}

    @Get('api/mcp/p/:slug')
    async metadata(@Param('slug') slug: string) {
        assertMcpOAuthEnabled()
        const publication = await this.publications.findActiveBySlug(slug)
        const resourceUrl = mcpPublicationPublicUrl(this.configService, `/api/mcp/p/${encodeURIComponent(slug)}`)
        return this.oauth.protectedResourceMetadata(publication, resourceUrl)
    }
}
