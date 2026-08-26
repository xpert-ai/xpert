import type { McpPrincipal } from '@xpert-ai/contracts'
import { Injectable, UnauthorizedException } from '@nestjs/common'
import { McpPublication } from './entities'
import { McpApiKeyService } from './mcp-api-key.service'
import { McpOAuthService } from './mcp-oauth.service'
import { assertMcpOAuthEnabled, isMcpOAuthEnabled } from './mcp-oauth-feature'

@Injectable()
export class McpAuthenticationService {
    constructor(
        private readonly apiKeys: McpApiKeyService,
        private readonly oauth: McpOAuthService
    ) {}

    async authenticate(publication: McpPublication, authorization?: string): Promise<McpPrincipal> {
        const token = bearerToken(authorization)
        if (!token) throw new UnauthorizedException()
        if (token.startsWith('xpert_mcp_')) return this.apiKeys.authenticate(publication, authorization)

        assertMcpOAuthEnabled()
        return this.oauth.authenticate(publication, token)
    }

    async challenge(publication: McpPublication, resourceMetadataUrl: string) {
        return isMcpOAuthEnabled() && publication.authMethods.includes('oauth')
            ? this.oauth.challenge(publication, resourceMetadataUrl)
            : 'Bearer'
    }
}

function bearerToken(authorization?: string) {
    const [scheme, token, extra] = authorization?.trim().split(/\s+/) ?? []
    return scheme?.toLowerCase() === 'bearer' && token && !extra ? token : ''
}
