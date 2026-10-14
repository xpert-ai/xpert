import { Test } from '@nestjs/testing'
import { ResolveTemplateConnectorsHandler } from './template-connectors.handler'
import { ResolveTemplateConnectorsCommand } from './template-connectors.command'
import { ConnectorService } from './connector.service'

const requirement = {
    key: 'calendar',
    provider: 'calendar',
    required: true,
    purpose: 'Read calendar',
    permissions: ['calendar.read']
}
describe('template connection authorization projection', () => {
    let handler: ResolveTemplateConnectorsHandler
    const service = { runtimeOptions: jest.fn(), authorizationStatusBinding: jest.fn() }
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            providers: [ResolveTemplateConnectorsHandler, { provide: ConnectorService, useValue: service }]
        }).compile()
        handler = module.get(ResolveTemplateConnectorsHandler)
    })
    beforeEach(() => {
        jest.clearAllMocks()
        service.runtimeOptions.mockResolvedValue({
            items: [
                {
                    provider: 'calendar',
                    bindingId: 'account',
                    label: 'Calendar',
                    status: 'active',
                    runtimeUsage: 'middleware'
                }
            ],
            canManageWorkspace: true,
            managementUrl: '/connections'
        })
        service.authorizationStatusBinding.mockResolvedValue({
            granted: true,
            connector: {
                status: 'active',
                scopes: ['calendar.read'],
                expiresAt: new Date(Date.now() + 60000).toISOString(),
                credentialCiphertext: 'never returned'
            }
        })
    })
    const command = () =>
        new ResolveTemplateConnectorsCommand('assistant', [requirement], {
            calendar: { choice: 'binding', bindingId: 'account' }
        })
    it('marks an authorized scoped account ready without credentials', async () => {
        const result = await handler.execute(command())
        expect(result.connectors[0].status).toBe('ready')
        expect(JSON.stringify(result)).not.toContain('never returned')
        expect(service.authorizationStatusBinding).toHaveBeenCalledWith('account', 'assistant')
    })
    it('requires all declared permission scopes', async () => {
        service.authorizationStatusBinding.mockResolvedValue({
            granted: true,
            connector: { status: 'active', scopes: [] }
        })
        expect((await handler.execute(command())).connectors[0].status).toBe('requires_auth')
    })
    it('returns the management path for the current client origin', async () => {
        service.runtimeOptions.mockResolvedValue({
            items: [],
            canManageWorkspace: true,
            managementUrl: 'https://platform.example/xpert/w/workspace/connectors'
        })
        expect((await handler.execute(command())).managementUrl).toBe('/xpert/w/workspace/connectors')
    })
    it('does not treat a stale active status as unexpired authorization', async () => {
        service.authorizationStatusBinding.mockResolvedValue({
            granted: true,
            connector: { status: 'active', scopes: ['calendar.read'], expiresAt: new Date(0).toISOString() }
        })
        expect((await handler.execute(command())).connectors[0].status).toBe('expired')
    })
    it('never resolves a connection outside the accessible catalog', async () => {
        const result = await handler.execute(
            new ResolveTemplateConnectorsCommand('assistant', [requirement], {
                calendar: { choice: 'binding', bindingId: 'foreign' }
            })
        )
        expect(result.connectors[0].status).toBe('requires_auth')
        expect(service.authorizationStatusBinding).not.toHaveBeenCalled()
    })
})
