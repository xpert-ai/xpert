import { BadRequestException } from '@nestjs/common'
import { ConnectorController } from './connector.controller'
import { ConnectorService } from './connector.service'

describe('ConnectorController', () => {
    it('registers public OAuth callbacks before workspace parameter routes', () => {
        const prototype = ConnectorController.prototype
        const methods = Object.getOwnPropertyNames(prototype)

        expect(Reflect.getMetadata('isPublic', prototype.oauthCallback)).toBe(true)
        expect(Reflect.getMetadata('isPublic', prototype.completeOAuthCallback)).toBe(true)
        expect(methods.indexOf('oauthCallback')).toBeLessThan(methods.indexOf('list'))
        expect(methods.indexOf('completeOAuthCallback')).toBeLessThan(methods.indexOf('list'))
    })

    it('uses the server callback URL instead of a client supplied redirectUri', async () => {
        const service: Pick<ConnectorService, 'connect'> = {
            connect: jest.fn().mockReturnValue('started')
        }
        const controller = new ConnectorController(service as ConnectorService)
        const body = {
            app: {
                appId: 'example_app_id',
                appSecret: 'app_secret'
            },
            redirectUri: 'https://attacker.example.com/callback'
        }

        const result = await controller.connect('workspace-1', 'example', body, {
            protocol: 'http',
            headers: {
                host: 'internal.local',
                'x-forwarded-proto': 'https',
                'x-forwarded-host': 'xpert.example.com'
            },
            get: (name) => (name === 'host' ? 'internal.local' : undefined)
        })

        expect(result).toBe('started')
        expect(service.connect).toHaveBeenCalledWith('workspace-1', 'example', {
            authMethodId: undefined,
            values: undefined,
            app: {
                appId: 'example_app_id',
                appSecret: 'app_secret'
            },
            redirectUri: 'https://xpert.example.com/api/connector/oauth/callback'
        })
    })

    it('uses the server callback URL for scoped binding authorization', async () => {
        const service: Pick<ConnectorService, 'connectBinding'> = {
            connectBinding: jest.fn().mockReturnValue('started')
        }
        const controller = new ConnectorController(service as ConnectorService)

        const result = await controller.connectBinding(
            'binding-1',
            {
                authMethodId: 'oauth2',
                values: { appId: 'example_app_id' },
                xpertId: 'xpert-1'
            },
            {
                protocol: 'http',
                headers: {
                    host: 'internal.local',
                    'x-forwarded-proto': 'https',
                    'x-forwarded-host': 'xpert.example.com'
                }
            }
        )

        expect(result).toBe('started')
        expect(service.connectBinding).toHaveBeenCalledWith('binding-1', {
            authMethodId: 'oauth2',
            values: { appId: 'example_app_id' },
            app: undefined,
            xpertId: 'xpert-1',
            redirectUri: 'https://xpert.example.com/api/connector/oauth/callback'
        })
    })

    it('binds a pending OAuth attempt to an HttpOnly browser cookie', async () => {
        const service = {
            connectBinding: jest.fn().mockResolvedValue({
                status: 'pending',
                connector: { id: 'binding-1' },
                authorizationUrl: 'https://oauth.example/authorize?state=oauth-state',
                stateExpiresAt: '2026-08-27T13:00:00.000Z'
            }),
            createOAuthBrowserBinding: jest.fn().mockReturnValue('browser-binding')
        }
        const controller = new ConnectorController(service as unknown as ConnectorService)
        const response = { cookie: jest.fn() }

        await controller.connectBinding(
            'binding-1',
            { authMethodId: 'oauth2' },
            { protocol: 'https', headers: { host: 'xpert.example.com' } },
            response as never
        )

        expect(response.cookie).toHaveBeenCalledWith(
            'xpert_connector_oauth_binding-1',
            'browser-binding',
            expect.objectContaining({
                httpOnly: true,
                sameSite: 'lax',
                secure: true,
                path: '/api/connector/oauth/callback'
            })
        )
    })

    it('renders a localized OAuth completion page that returns to workspace connectors', async () => {
        const service = {
            getOAuthCallbackContext: jest.fn().mockResolvedValue({
                connectorId: 'connector-1',
                scope: { type: 'workspace', workspaceId: 'workspace-1' },
                workspaceId: 'workspace-1'
            }),
            assertOAuthBrowserBinding: jest.fn(),
            completeOAuthCallback: jest.fn().mockResolvedValue({
                id: 'connector-1',
                workspaceId: 'workspace-1',
                provider: 'github',
                status: 'active'
            })
        }
        const controller = new ConnectorController(
            service as unknown as ConnectorService,
            {
                get: jest.fn().mockReturnValue('https://xpert.example.com')
            } as never
        )
        const response = htmlResponse()

        await controller.oauthCallback(
            'oauth-state',
            'oauth-code',
            {
                headers: {
                    'accept-language': 'zh-CN,zh;q=0.9',
                    cookie: 'xpert_connector_oauth_connector-1=browser-binding'
                }
            },
            response as never
        )

        expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html; charset=utf-8')
        expect(response.send).toHaveBeenCalledWith(expect.stringContaining('授权成功'))
        expect(response.send).toHaveBeenCalledWith(
            expect.stringContaining('href="https://xpert.example.com/xpert/w/workspace-1/connectors"')
        )
        expect(response.send).not.toHaveBeenCalledWith(expect.stringContaining('connector-1'))
        expect(service.assertOAuthBrowserBinding).toHaveBeenCalledWith('oauth-state', 'browser-binding')
    })

    it('renders a safe OAuth failure page with the same workspace return action', async () => {
        const service = {
            getOAuthCallbackContext: jest.fn().mockResolvedValue({
                connectorId: 'connector-1',
                scope: { type: 'workspace', workspaceId: 'workspace-1' },
                workspaceId: 'workspace-1'
            }),
            assertOAuthBrowserBinding: jest.fn(),
            completeOAuthCallback: jest.fn().mockRejectedValue(new Error('Invalid <oauth> state'))
        }
        const controller = new ConnectorController(
            service as unknown as ConnectorService,
            {
                get: jest.fn().mockReturnValue('https://xpert.example.com')
            } as never
        )
        const response = htmlResponse()

        await controller.oauthCallback(
            'oauth-state',
            'oauth-code',
            { headers: { 'accept-language': 'en-US,en;q=0.9' } },
            response as never
        )

        expect(response.send).toHaveBeenCalledWith(expect.stringContaining('Authorization incomplete'))
        expect(response.send).toHaveBeenCalledWith(expect.stringContaining('Invalid &lt;oauth&gt; state'))
        expect(response.send).toHaveBeenCalledWith(
            expect.stringContaining('href="https://xpert.example.com/xpert/w/workspace-1/connectors"')
        )
        expect(response.send).not.toHaveBeenCalledWith(expect.stringContaining('Invalid <oauth> state'))
    })

    it('returns a completed Project Connector authorization to the Project', async () => {
        const service = {
            getOAuthCallbackContext: jest.fn().mockResolvedValue({
                connectorId: 'connector-1',
                scope: { type: 'project', projectId: 'project-1' }
            }),
            assertOAuthBrowserBinding: jest.fn(),
            completeOAuthCallback: jest.fn().mockResolvedValue({
                id: 'connector-1',
                scope: { type: 'project', projectId: 'project-1' },
                projectId: 'project-1',
                provider: 'github',
                status: 'active'
            })
        }
        const controller = new ConnectorController(
            service as unknown as ConnectorService,
            {
                get: jest.fn().mockReturnValue('https://xpert.example.com')
            } as never
        )
        const response = htmlResponse()

        await controller.oauthCallback(
            'oauth-state',
            'oauth-code',
            {
                headers: {
                    'accept-language': 'en-US',
                    cookie: 'xpert_connector_oauth_connector-1=browser-binding'
                }
            },
            response as never
        )

        expect(response.send).toHaveBeenCalledWith(
            expect.stringContaining('href="https://xpert.example.com/project/project-1"')
        )
    })

    it('does not exchange an OAuth code when the browser binding is missing', async () => {
        const service = {
            getOAuthCallbackContext: jest.fn().mockResolvedValue({
                connectorId: 'connector-1',
                scope: { type: 'project', projectId: 'project-1' }
            }),
            assertOAuthBrowserBinding: jest.fn(() => {
                throw new BadRequestException('Browser binding is missing')
            }),
            completeOAuthCallback: jest.fn()
        }
        const controller = new ConnectorController(service as unknown as ConnectorService)
        const response = htmlResponse()

        await controller.oauthCallback('oauth-state', 'oauth-code', { headers: {} }, response as never)

        expect(service.completeOAuthCallback).not.toHaveBeenCalled()
        expect(response.send).toHaveBeenCalledWith(expect.stringContaining('Browser binding is missing'))
    })

    it('enforces the same browser binding on the JSON OAuth callback', async () => {
        const service = {
            getOAuthCallbackContext: jest.fn().mockResolvedValue({
                connectorId: 'connector-1',
                scope: { type: 'workspace', workspaceId: 'workspace-1' }
            }),
            assertOAuthBrowserBinding: jest.fn(),
            completeOAuthCallback: jest.fn().mockResolvedValue({ id: 'connector-1', status: 'active' })
        }
        const controller = new ConnectorController(service as unknown as ConnectorService)
        const response = { clearCookie: jest.fn() }

        await controller.completeOAuthCallback(
            { state: 'oauth-state', code: 'oauth-code' },
            { headers: { cookie: 'xpert_connector_oauth_connector-1=browser-binding' } },
            response as never
        )

        expect(service.assertOAuthBrowserBinding).toHaveBeenCalledWith('oauth-state', 'browser-binding')
        expect(service.completeOAuthCallback).toHaveBeenCalledWith({ state: 'oauth-state', code: 'oauth-code' })
        expect(response.clearCookie).toHaveBeenCalledWith('xpert_connector_oauth_connector-1', {
            path: '/api/connector/oauth/callback'
        })
    })

    it('rejects an unknown Connector scope discriminator', () => {
        const controller = new ConnectorController({} as ConnectorService)

        expect(() => controller.bindings('organization', 'org-1')).toThrow(BadRequestException)
    })

    it('rejects legacy app integration ids from the public connect API', async () => {
        const service: Pick<ConnectorService, 'connect'> = {
            connect: jest.fn()
        }
        const controller = new ConnectorController(service as ConnectorService)
        const body: Parameters<ConnectorController['connect']>[2] & { appIntegrationId: string } = {
            appIntegrationId: 'integration-1'
        }

        await expect(
            controller.connect('workspace-1', 'example', body, {
                protocol: 'https',
                headers: {
                    host: 'xpert.example.com'
                }
            })
        ).rejects.toBeInstanceOf(BadRequestException)

        expect(service.connect).not.toHaveBeenCalled()
    })

    it('delegates pending authorization cancellation to the service', async () => {
        const service: Pick<ConnectorService, 'cancelAuthorization'> = {
            cancelAuthorization: jest.fn().mockResolvedValue(null)
        }
        const controller = new ConnectorController(service as ConnectorService)

        await expect(controller.cancelAuthorization('workspace-1', 'connector-1')).resolves.toBeNull()
        expect(service.cancelAuthorization).toHaveBeenCalledWith('workspace-1', 'connector-1')
    })
})

function htmlResponse() {
    return {
        setHeader: jest.fn(),
        clearCookie: jest.fn(),
        send: jest.fn()
    }
}
