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

    it('uses the server callback URL instead of a client supplied redirectUri', () => {
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

        const result = controller.connect('workspace-1', 'example', body, {
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

    it('renders a localized OAuth completion page that returns to workspace connectors', async () => {
        const service = {
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
            { headers: { 'accept-language': 'zh-CN,zh;q=0.9' } },
            response as never
        )

        expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html; charset=utf-8')
        expect(response.send).toHaveBeenCalledWith(expect.stringContaining('授权成功'))
        expect(response.send).toHaveBeenCalledWith(
            expect.stringContaining('href="https://xpert.example.com/xpert/w/workspace-1/connectors"')
        )
        expect(response.send).not.toHaveBeenCalledWith(expect.stringContaining('connector-1'))
    })

    it('renders a safe OAuth failure page with the same workspace return action', async () => {
        const service = {
            getOAuthCallbackContext: jest.fn().mockResolvedValue({
                workspaceId: 'workspace-1'
            }),
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

    it('rejects legacy app integration ids from the public connect API', () => {
        const service: Pick<ConnectorService, 'connect'> = {
            connect: jest.fn()
        }
        const controller = new ConnectorController(service as ConnectorService)
        const body: Parameters<ConnectorController['connect']>[2] & { appIntegrationId: string } = {
            appIntegrationId: 'integration-1'
        }

        expect(() =>
            controller.connect('workspace-1', 'example', body, {
                protocol: 'https',
                headers: {
                    host: 'xpert.example.com'
                }
            })
        ).toThrow(BadRequestException)

        expect(service.connect).not.toHaveBeenCalled()
    })
})

function htmlResponse() {
    return {
        setHeader: jest.fn(),
        send: jest.fn()
    }
}
