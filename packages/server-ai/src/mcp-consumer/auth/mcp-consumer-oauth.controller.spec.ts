import { ConfigService } from '@xpert-ai/server-config'
import { McpConsumerOAuthController } from './mcp-consumer-oauth.controller'
import { McpConsumerOAuthService } from './mcp-consumer-oauth.service'

describe('McpConsumerOAuthController', () => {
    it('uses the trusted API base URL for the OAuth redirect URI', () => {
        const service = {
            begin: jest.fn().mockReturnValue({ authorizationUrl: 'https://provider.example/authorize' })
        } as unknown as McpConsumerOAuthService
        const configService = {
            get: jest.fn((key: string) => (key === 'baseUrl' ? 'https://api.xpert.example/base-path' : undefined))
        } as unknown as ConfigService
        const controller = new McpConsumerOAuthController(service, configService)

        controller.authorize('workspace-1', 'toolset-1', { serverName: 'remote' })

        expect(service.begin).toHaveBeenCalledWith({
            workspaceId: 'workspace-1',
            toolsetId: 'toolset-1',
            serverName: 'remote',
            redirectUri: 'https://api.xpert.example/api/xpert-toolset/mcp-consumer/oauth/callback'
        })
    })
})
