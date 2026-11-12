import { Test } from '@nestjs/testing'
import { RedisEphemeralService } from '@xpert-ai/server-core'
import { ConnectorService } from '../connector.service'
import { ConnectorOAuthLaunchService } from './connector-oauth-launch.service'
import type { ConnectorConnectResponse } from '@xpert-ai/plugin-sdk'
const result: ConnectorConnectResponse = {
    status: 'pending', authorizationUrl: 'https://provider.example/authorize?state=state',
    connector: { id: 'binding', provider: 'test', status: 'pending', workspaceId: null }
}
async function fixture() {
    const stored = new Map<string, string>()
    const tickets = {
        issueTicket: jest.fn(async (_namespace: string, payload: string, _ttl: number) => { stored.set('ticket', payload); return 'ticket' }),
        consumeTicket: jest.fn(async (_namespace: string, ticket: string) => { const value = stored.get(ticket); stored.delete(ticket); return value ?? null })
    }
    const connectors = { getOAuthCallbackContext: jest.fn().mockResolvedValue({ connectorId: 'binding' }), createOAuthBrowserBinding: jest.fn().mockReturnValue('signed-binding') }
    const module = await Test.createTestingModule({ providers: [ConnectorOAuthLaunchService,
        { provide: RedisEphemeralService, useValue: tickets }, { provide: ConnectorService, useValue: connectors }] }).compile()
    return { service: module.get(ConnectorOAuthLaunchService), tickets, connectors, stored }
}
it('creates a one-use browser launch without exposing the upstream OAuth URL to the host', async () => {
    const { service, tickets, connectors } = await fixture()
    const issued = await service.issue(result, 'https://api.example/api/connector/oauth/callback')
    expect(issued.authorizationUrl).toBe('https://api.example/api/connector/oauth/launch?ticket=ticket')
    expect(tickets.issueTicket).toHaveBeenCalledWith('connector.oauth.launch', expect.any(String), expect.any(Number))
    expect(tickets.issueTicket.mock.calls[0][2]).toBeLessThanOrEqual(120000)
    expect(await service.consume('ticket')).toMatchObject({ browserBinding: 'signed-binding', secure: true, connectorId: 'binding' })
    expect(connectors.createOAuthBrowserBinding).toHaveBeenCalledWith('state')
    await expect(service.consume('ticket')).rejects.toThrow()
})
it('rejects expiry, mismatched connector sessions and missing state', async () => {
    const { service, connectors } = await fixture()
    await expect(service.issue({ ...result, stateExpiresAt: new Date(0).toISOString() }, 'https://api.example')).rejects.toThrow()
    await expect(service.issue({ ...result, authorizationUrl: 'https://provider.example/authorize' }, 'https://api.example')).rejects.toThrow()
    await service.issue(result, 'https://api.example')
    connectors.getOAuthCallbackContext.mockResolvedValue({ connectorId: 'other' })
    await expect(service.consume('ticket')).rejects.toThrow()
    expect(connectors.createOAuthBrowserBinding).not.toHaveBeenCalled()
})
it('does not create OAuth tickets for immediate API-key connections', async () => {
    const { service, tickets } = await fixture()
    expect(await service.issue({ ...result, status: 'active', authorizationUrl: undefined }, 'https://api.example')).toEqual({ status: 'active' })
    expect(tickets.issueTicket).not.toHaveBeenCalled()
})
