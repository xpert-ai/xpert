import { BadRequestException } from '@nestjs/common'
import { ConnectorController } from './connector.controller'
import { ConnectorService } from './connector.service'

describe('ConnectorController', () => {
    it('uses the server callback URL instead of a client supplied redirectUri', () => {
        const service: Pick<ConnectorService, 'startOAuth'> = {
            startOAuth: jest.fn().mockReturnValue('started')
        }
        const controller = new ConnectorController(service as ConnectorService)
        const body = {
            app: {
                appId: 'example_app_id',
                appSecret: 'app_secret'
            },
            redirectUri: 'https://attacker.example.com/callback'
        }

        const result = controller.connect(
            'workspace-1',
            'example',
            body,
            {
                protocol: 'http',
                headers: {
                    host: 'internal.local',
                    'x-forwarded-proto': 'https',
                    'x-forwarded-host': 'xpert.example.com'
                },
                get: (name) => (name === 'host' ? 'internal.local' : undefined)
            }
        )

        expect(result).toBe('started')
        expect(service.startOAuth).toHaveBeenCalledWith('workspace-1', 'example', {
            app: {
                appId: 'example_app_id',
                appSecret: 'app_secret'
            },
            redirectUri: 'https://xpert.example.com/api/connector/oauth/callback'
        })
    })

    it('rejects legacy app integration ids from the public connect API', () => {
        const service: Pick<ConnectorService, 'startOAuth'> = {
            startOAuth: jest.fn()
        }
        const controller = new ConnectorController(service as ConnectorService)
        const body: Parameters<ConnectorController['connect']>[2] & { appIntegrationId: string } = {
            appIntegrationId: 'integration-1'
        }

        expect(() =>
            controller.connect(
                'workspace-1',
                'example',
                body,
                {
                    protocol: 'https',
                    headers: {
                        host: 'xpert.example.com'
                    }
                }
            )
        ).toThrow(BadRequestException)

        expect(service.startOAuth).not.toHaveBeenCalled()
    })
})
