import { PendingSsoBindingChallengeService } from './pending-sso-binding-challenge.service'

describe('PendingSsoBindingChallengeService', () => {
  let redisClient: {
    setEx: jest.Mock
    get: jest.Mock
    del: jest.Mock
    getDel: jest.Mock
  }
  let service: PendingSsoBindingChallengeService

  beforeEach(() => {
    jest.clearAllMocks()
    redisClient = {
      setEx: jest.fn().mockResolvedValue('OK'),
      get: jest.fn(),
      del: jest.fn().mockResolvedValue(1),
      getDel: jest.fn()
    }
    service = new PendingSsoBindingChallengeService(redisClient as any)
  })

  it('creates a challenge and stores it with ttl', async () => {
    const result = await service.create({
      provider: 'lark',
      subjectId: 'union-1',
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      displayName: 'Alice',
      avatarUrl: 'https://example.com/avatar.png',
      returnTo: '/workspace'
    })

    expect(result.ticket).toMatch(/^[a-f0-9]{32,}$/)
    expect(redisClient.setEx).toHaveBeenCalledWith(
      `auth:sso:bind:challenge:${result.ticket}`,
      600,
      expect.stringContaining('"flow":"anonymous_bind"')
    )
  })

  it('reads an existing challenge by ticket', async () => {
    redisClient.get.mockResolvedValue(
      JSON.stringify({
        ticket: 'ticket-1',
        flow: 'current_user_confirm',
        provider: 'lark',
        subjectId: 'union-1',
        tenantId: 'tenant-1',
        expiresAt: new Date().toISOString()
      })
    )

    await expect(service.get('ticket-1')).resolves.toEqual({
      ticket: 'ticket-1',
      flow: 'current_user_confirm',
      provider: 'lark',
      subjectId: 'union-1',
      tenantId: 'tenant-1',
      expiresAt: expect.any(String)
    })
  })

  it('consumes an existing challenge with getDel when available', async () => {
    redisClient.getDel.mockResolvedValue(
      JSON.stringify({
        ticket: 'ticket-1',
        flow: 'current_user_confirm',
        provider: 'lark',
        subjectId: 'union-1',
        tenantId: 'tenant-1',
        expiresAt: new Date().toISOString()
      })
    )

    await expect(service.consume('ticket-1')).resolves.toEqual({
      ticket: 'ticket-1',
      flow: 'current_user_confirm',
      provider: 'lark',
      subjectId: 'union-1',
      tenantId: 'tenant-1',
      expiresAt: expect.any(String)
    })
    expect(redisClient.getDel).toHaveBeenCalledWith('auth:sso:bind:challenge:ticket-1')
  })
})
