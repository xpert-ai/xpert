jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import { ConnectorOAuthLaunchController } from './connector-oauth-launch.controller'
import { ConnectorOAuthLaunchService } from './connector-oauth-launch.service'

describe('OAuth browser launch HTTP boundary', () => {
    let app: INestApplication, url: string
    const launches = { consume: jest.fn() }
    beforeAll(async () => {
        const module = await Test.createTestingModule({ controllers: [ConnectorOAuthLaunchController],
            providers: [{ provide: ConnectorOAuthLaunchService, useValue: launches }] }).compile()
        app = module.createNestApplication({ logger: false })
        await app.listen(0, '127.0.0.1')
        url = `${await app.getUrl()}/oauth/launch`
    })
    beforeEach(() => {
        jest.resetAllMocks()
        launches.consume.mockResolvedValue({ connectorId: 'binding', browserBinding: 'bound-cookie',
            secure: true, expiresAt: Date.now() + 60000, authorizationUrl: 'https://provider.example/authorize?state=opaque' })
    })
    afterAll(async () => app?.close())
    it('sets a callback-scoped HttpOnly binding and redirects without caching or referrer leakage', async () => {
        const ticket = 'a'.repeat(64)
        const response = await fetch(`${url}?ticket=${ticket}`, { redirect: 'manual' })
        expect(response.status).toBe(303)
        expect(launches.consume).toHaveBeenCalledWith(ticket)
        expect(response.headers.get('location')).toBe('https://provider.example/authorize?state=opaque')
        expect(response.headers.get('cache-control')).toBe('no-store')
        expect(response.headers.get('referrer-policy')).toBe('no-referrer')
        const cookie = response.headers.get('set-cookie')
        for (const part of ['xpert_connector_oauth_binding=', 'Path=/api/connector/oauth/callback', 'HttpOnly', 'Secure', 'SameSite=Lax'])
            expect(cookie).toContain(part)
    })
    it.each(['', '?ticket=short', `?ticket=${'a'.repeat(64)}&ticket=${'b'.repeat(64)}`,
        `?ticket=${'a'.repeat(64)}&projectId=other`])('rejects malformed queries before consuming a ticket: %s', async (query) => {
        expect((await fetch(url + query, { redirect: 'manual' })).status).toBe(400)
        expect(launches.consume).not.toHaveBeenCalled()
    })
})
