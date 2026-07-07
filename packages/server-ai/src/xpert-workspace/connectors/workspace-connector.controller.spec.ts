import { XpertWorkspaceConnectorController } from './workspace-connector.controller'
import { XpertWorkspaceConnectorService } from './workspace-connector.service'

describe('XpertWorkspaceConnectorController', () => {
    it('uses the server callback URL instead of a client supplied redirectUri', () => {
        const service: Pick<XpertWorkspaceConnectorService, 'startOAuth'> = {
            startOAuth: jest.fn().mockReturnValue('started')
        }
        const controller = new XpertWorkspaceConnectorController(service as XpertWorkspaceConnectorService)
        const body = {
            appIntegrationId: 'integration-1',
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
            appIntegrationId: 'integration-1',
            app: undefined,
            redirectUri: 'https://xpert.example.com/api/xpert-workspace/connectors/oauth/callback'
        })
    })
})
