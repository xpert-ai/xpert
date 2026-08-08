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

	it('does not let the public binding flow mint a verified-email signup ticket', async () => {
		const result = await service.create({
			flow: 'verified_email_signup',
			provider: 'github-sso',
			subjectId: '123',
			tenantId: 'tenant-1'
		} as any)

		expect(redisClient.setEx).toHaveBeenCalledWith(
			`auth:sso:bind:challenge:${result.ticket}`,
			600,
			expect.stringContaining('"flow":"anonymous_bind"')
		)
	})

	it('creates a host-owned verified-email signup challenge with a ten minute ttl', async () => {
		const result = await service.createVerifiedEmailSignup({
			provider: 'github-sso',
			subjectId: '123',
			tenantId: 'tenant-1',
			verifiedEmail: ' Alice@Example.com ',
			displayName: 'Alice',
			avatarUrl: 'https://avatars.example.com/alice.png',
			profile: {
				login: 'alice'
			},
			returnTo: '/projects/demo'
		})

		const [, ttl, serialized] = redisClient.setEx.mock.calls[0]
		expect(ttl).toBe(600)
		expect(JSON.parse(serialized)).toEqual(
			expect.objectContaining({
				ticket: result.ticket,
				flow: 'verified_email_signup',
				provider: 'github-sso',
				subjectId: '123',
				tenantId: 'tenant-1',
				verifiedEmail: 'alice@example.com',
				displayName: 'Alice',
				avatarUrl: 'https://avatars.example.com/alice.png',
				profile: {
					login: 'alice'
				},
				returnTo: '/projects/demo'
			})
		)
	})

	it('rejects an off-site return path for a verified-email signup challenge', async () => {
		await expect(
			service.createVerifiedEmailSignup({
				provider: 'github-sso',
				subjectId: '123',
				tenantId: 'tenant-1',
				verifiedEmail: 'alice@example.com',
				returnTo: '//evil.example.com'
			})
		).rejects.toThrow(/same-origin path/)
		expect(redisClient.setEx).not.toHaveBeenCalled()
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

	it('refuses a non-atomic consume fallback', async () => {
		const serviceWithoutGetDel = new PendingSsoBindingChallengeService({
			setEx: redisClient.setEx,
			get: redisClient.get,
			del: redisClient.del
		} as any)

		await expect(serviceWithoutGetDel.consume('ticket-1')).rejects.toThrow(/atomic getDel/)
		expect(redisClient.get).not.toHaveBeenCalled()
		expect(redisClient.del).not.toHaveBeenCalled()
})
})
