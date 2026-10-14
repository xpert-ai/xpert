import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { ConnectorIntegrationController } from './connector-integration.controller'
import { ConnectorIntegrationService } from './connector-integration.service'

describe('Connector integration HTTP validation', () => {
    const bindingId = 'b4764c5f-3a03-4cdf-9c5b-173993dc6d82'
    let app: INestApplication
    let origin: string
    const integrations = { list: jest.fn(), prepare: jest.fn() }
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [ConnectorIntegrationController],
            providers: [{ provide: ConnectorIntegrationService, useValue: integrations }]
        }).compile()
        app = module.createNestApplication({ logger: false })
        await app.listen(0, '127.0.0.1')
        origin = await app.getUrl()
    })
    afterAll(() => app?.close())
    beforeEach(() => jest.clearAllMocks())
    it('rejects extra scope and secret fields before invoking the integration capability', async () => {
        const result = await fetch(`${origin}/bindings/${bindingId}/integration`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                authMethodId: 'oauth',
                selection: { type: 'existing', integrationId: 'bad' },
                tenantId: 'foreign',
                secret: 'sensitive'
            })
        })
        expect(result.status).toBe(400)
        expect(await result.text()).not.toContain('sensitive')
        expect(integrations.prepare).not.toHaveBeenCalled()
    })
    it('rejects a malformed binding identity before database access', async () => {
        const result = await fetch(`${origin}/bindings/not-a-uuid/integration`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ authMethodId: 'oauth', selection: { type: 'existing', integrationId: bindingId } })
        })
        expect(result.status).toBe(400)
        expect(integrations.prepare).not.toHaveBeenCalled()
    })
    it('passes a validated selection and trimmed name without accepting provider overrides', async () => {
        const input = {
            authMethodId: 'oauth',
            selection: {
                type: 'new',
                requestId: '34b51877-4110-4820-b232-b37d274bb99e',
                name: ' App ',
                values: { clientId: 'id', clientSecret: 'secret' }
            }
        }
        integrations.prepare.mockResolvedValue({ id: 'app', name: 'App', organizationId: null })
        const result = await fetch(`${origin}/bindings/${bindingId}/integration`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(input)
        })
        expect(result.status).toBe(201)
        expect(integrations.prepare).toHaveBeenCalledWith(bindingId, {
            ...input,
            selection: { ...input.selection, name: 'App' }
        })
        expect(await result.json()).toEqual({ id: 'app', name: 'App', organizationId: null })
    })
})
