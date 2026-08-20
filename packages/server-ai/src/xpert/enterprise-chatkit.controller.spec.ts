import { EnterpriseChatkitController } from './enterprise-chatkit.controller'
import { EnterpriseChatkitSessionService } from './enterprise-chatkit-session.service'

describe('EnterpriseChatkitController', () => {
    it('returns only display metadata and public SDK config from the enterprise H5 bootstrap', async () => {
        const service = {
            getBootstrap: jest.fn().mockResolvedValue({
                xpert: {
                    id: 'xpert-1',
                    slug: 'sales',
                    name: 'Sales',
                    type: 'agent',
                    description: 'Sales assistant',
                    title: 'Sales expert',
                    starters: ['Show the pipeline'],
                    features: { opener: { enabled: true } },
                    tenantId: 'tenant-1',
                    organizationId: 'org-1',
                    app: {
                        enabled: true,
                        channels: {
                            dingtalk: {
                                integrationId: 'integration-secret'
                            }
                        }
                    }
                },
                platform: 'dingtalk',
                clientConfig: { corpId: 'corp-1' }
            }),
            createSession: jest.fn().mockResolvedValue({ client_secret: 'secret-1' })
        }
        const controller = new EnterpriseChatkitController(service as unknown as EnterpriseChatkitSessionService)

        const result = await controller.getBootstrap('sales', 'dingtalk')

        expect(result).toMatchObject({
            xpert: {
                id: 'xpert-1',
                slug: 'sales',
                starters: ['Show the pipeline']
            },
            platform: 'dingtalk',
            clientConfig: { corpId: 'corp-1' }
        })
        expect(result.xpert).not.toHaveProperty('tenantId')
        expect(result.xpert).not.toHaveProperty('organizationId')
        expect(result.xpert).not.toHaveProperty('app')

        await expect(
            controller.createSession('sales', 'dingtalk', {
                grant: { type: 'authorization_code', code: 'auth-code-1' }
            })
        ).resolves.toEqual({ client_secret: 'secret-1' })
    })
})
