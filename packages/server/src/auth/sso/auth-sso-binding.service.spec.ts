import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common'
import { AuthSsoBindingService } from './auth-sso-binding.service'

jest.mock('bcryptjs', () => ({
  compare: jest.fn()
}))

jest.mock('../../core/context', () => ({
  RequestContext: {
    currentUserId: jest.fn(),
    getScope: jest.fn()
  }
}))

const bcrypt = require('bcryptjs')
const { RequestContext } = require('../../core/context')

describe('AuthSsoBindingService', () => {
  const pendingSsoBindingChallengeService = {
    get: jest.fn(),
    delete: jest.fn().mockResolvedValue(undefined)
  }
  const accountBindingService = {
    getUserBinding: jest.fn(),
    bindUser: jest.fn(),
    resolveUser: jest.fn()
  }
  const authService = {
    issueTokensForUser: jest.fn(),
    register: jest.fn()
  }
  const userService = {
    findOneByOptions: jest.fn()
  }

  let service: AuthSsoBindingService

  beforeEach(() => {
    jest.clearAllMocks()
    RequestContext.currentUserId.mockReturnValue('user-ctx')
    RequestContext.getScope.mockReturnValue({
      tenantId: 'tenant-1',
      level: 'tenant',
      organizationId: null
    })
    service = new AuthSsoBindingService(
      pendingSsoBindingChallengeService as any,
      accountBindingService as any,
      authService as any,
      userService as any
    )
  })

  it('returns a minimal anonymous challenge view', async () => {
    pendingSsoBindingChallengeService.get.mockResolvedValue({
      ticket: 'ticket-1',
      flow: 'anonymous_bind',
      provider: 'lark',
      subjectId: 'union-1',
      tenantId: 'tenant-1',
      displayName: 'Alice',
      avatarUrl: 'https://example.com/avatar.png',
      expiresAt: '2099-01-01T00:00:00.000Z'
    })

    await expect(service.getChallenge('ticket-1')).resolves.toEqual({
      provider: 'lark',
      displayName: 'Alice',
      avatarUrl: 'https://example.com/avatar.png',
      tenantScoped: true,
      expiresAt: '2099-01-01T00:00:00.000Z'
    })
  })

  it('completes anonymous binding for a valid tenant user and preserves returnTo', async () => {
    pendingSsoBindingChallengeService.get.mockResolvedValue({
      ticket: 'ticket-1',
      flow: 'anonymous_bind',
      provider: 'lark',
      subjectId: 'union-1',
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      profile: {
        unionId: 'union-1'
      },
      returnTo: '/projects/demo',
      expiresAt: '2099-01-01T00:00:00.000Z'
    })
    userService.findOneByOptions.mockResolvedValue({
      id: 'user-1',
      hash: 'hashed-password'
    })
    bcrypt.compare.mockResolvedValue(true)
    accountBindingService.getUserBinding.mockResolvedValue(null)
    accountBindingService.bindUser.mockResolvedValue({
      provider: 'lark',
      subjectId: 'union-1'
    })
    authService.issueTokensForUser.mockResolvedValue({
      jwt: 'jwt-token',
      refreshToken: 'refresh-token',
      userId: 'user-1'
    })

    await expect(
      service.completeBinding({
        ticket: 'ticket-1',
        userName: 'Alice',
        password: 'secret'
      })
    ).resolves.toEqual({
      location:
        '/sign-in/success?jwt=jwt-token&refreshToken=refresh-token&userId=user-1&returnTo=%2Fprojects%2Fdemo'
    })

    expect(accountBindingService.bindUser).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      userId: 'user-1',
      provider: 'lark',
      subjectId: 'union-1',
      profile: {
        unionId: 'union-1'
      }
    })
    expect(pendingSsoBindingChallengeService.delete).toHaveBeenCalledWith('ticket-1')
  })

  it('fails anonymous binding when the local account credentials are invalid', async () => {
    pendingSsoBindingChallengeService.get.mockResolvedValue({
      ticket: 'ticket-1',
      flow: 'anonymous_bind',
      provider: 'lark',
      subjectId: 'union-1',
      tenantId: 'tenant-1',
      expiresAt: '2099-01-01T00:00:00.000Z'
    })
    userService.findOneByOptions.mockResolvedValue({
      id: 'user-1',
      hash: 'hashed-password'
    })
    bcrypt.compare.mockResolvedValue(false)

    await expect(
      service.completeBinding({
        ticket: 'ticket-1',
        userName: 'alice',
        password: 'wrong'
      })
    ).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('fails anonymous binding when the target account is already bound to another identity', async () => {
    pendingSsoBindingChallengeService.get.mockResolvedValue({
      ticket: 'ticket-1',
      flow: 'anonymous_bind',
      provider: 'lark',
      subjectId: 'union-1',
      tenantId: 'tenant-1',
      expiresAt: '2099-01-01T00:00:00.000Z'
    })
    userService.findOneByOptions.mockResolvedValue({
      id: 'user-1',
      hash: 'hashed-password'
    })
    bcrypt.compare.mockResolvedValue(true)
    accountBindingService.getUserBinding.mockResolvedValue({
      provider: 'lark',
      subjectId: 'union-old'
    })

    await expect(
      service.completeBinding({
        ticket: 'ticket-1',
        userName: 'alice',
        password: 'secret'
      })
    ).rejects.toBeInstanceOf(ConflictException)
  })

  it('returns a minimal current-user challenge view for the authenticated tenant', async () => {
    pendingSsoBindingChallengeService.get.mockResolvedValue({
      ticket: 'ticket-1',
      flow: 'current_user_confirm',
      provider: 'lark',
      subjectId: 'union-1',
      tenantId: 'tenant-1',
      displayName: 'Alice',
      avatarUrl: 'https://example.com/avatar.png',
      expiresAt: '2099-01-01T00:00:00.000Z'
    })

    await expect(service.getCurrentUserChallenge('ticket-1')).resolves.toEqual({
      provider: 'lark',
      displayName: 'Alice',
      avatarUrl: 'https://example.com/avatar.png',
      tenantScoped: true,
      expiresAt: '2099-01-01T00:00:00.000Z'
    })
  })

  it('completes current-user binding with the authenticated user only', async () => {
    pendingSsoBindingChallengeService.get.mockResolvedValue({
      ticket: 'ticket-1',
      flow: 'current_user_confirm',
      provider: 'lark',
      subjectId: 'union-1',
      tenantId: 'tenant-1',
      profile: {
        unionId: 'union-1'
      },
      returnTo: '/settings/account',
      expiresAt: '2099-01-01T00:00:00.000Z'
    })
    accountBindingService.getUserBinding.mockResolvedValue(null)
    accountBindingService.bindUser.mockResolvedValue({
      provider: 'lark',
      subjectId: 'union-1'
    })

    await expect(
      service.completeCurrentUserBinding({
        ticket: 'ticket-1'
      })
    ).resolves.toEqual({
      location: '/settings/account'
    })

    expect(accountBindingService.bindUser).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      userId: 'user-ctx',
      provider: 'lark',
      subjectId: 'union-1',
      profile: {
        unionId: 'union-1'
      }
    })
    expect(authService.issueTokensForUser).not.toHaveBeenCalled()
    expect(pendingSsoBindingChallengeService.delete).toHaveBeenCalledWith('ticket-1')
  })

  it('rejects current-user challenge access when the session tenant does not match', async () => {
    pendingSsoBindingChallengeService.get.mockResolvedValue({
      ticket: 'ticket-1',
      flow: 'current_user_confirm',
      provider: 'lark',
      subjectId: 'union-1',
      tenantId: 'tenant-2',
      expiresAt: '2099-01-01T00:00:00.000Z'
    })

    await expect(service.getCurrentUserChallenge('ticket-1')).rejects.toBeInstanceOf(
      BadRequestException
    )
  })
})
