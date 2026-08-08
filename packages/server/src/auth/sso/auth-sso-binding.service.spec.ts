import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common'
import { LanguagesEnum } from '@xpert-ai/contracts'
import { AuthSsoBindingService } from './auth-sso-binding.service'

jest.mock('bcryptjs', () => ({
	compare: jest.fn()
}))

jest.mock('../../core/context', () => ({
	RequestContext: {
		currentUserId: jest.fn(),
		getScope: jest.fn(),
		currentRequest: jest.fn()
	}
}))

const bcrypt = require('bcryptjs')
const { RequestContext } = require('../../core/context')

describe('AuthSsoBindingService', () => {
	const pendingSsoBindingChallengeService = {
		get: jest.fn(),
		consume: jest.fn(),
		delete: jest.fn().mockResolvedValue(undefined)
	}
	const accountBindingService = {
		getUserBinding: jest.fn(),
		bindUser: jest.fn(),
		resolveUser: jest.fn()
	}
	const authService = {
		issueTokensForUser: jest.fn(),
		register: jest.fn(),
		registerVerifiedExternalIdentity: jest.fn()
	}
	const userService = {
		findOneByOptions: jest.fn()
	}

	let service: AuthSsoBindingService

	beforeEach(() => {
		jest.clearAllMocks()
		pendingSsoBindingChallengeService.consume.mockImplementation((ticket) =>
			pendingSsoBindingChallengeService.get(ticket)
		)
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
			flow: 'anonymous_bind',
			provider: 'lark',
			displayName: 'Alice',
			avatarUrl: 'https://example.com/avatar.png',
			tenantScoped: true,
			expiresAt: '2099-01-01T00:00:00.000Z'
		})
	})

	it('returns the trusted email only for a verified-email signup challenge', async () => {
		pendingSsoBindingChallengeService.get.mockResolvedValue({
			ticket: 'ticket-1',
			flow: 'verified_email_signup',
			provider: 'github-sso',
			subjectId: '123',
			tenantId: 'tenant-1',
			verifiedEmail: 'alice@example.com',
			displayName: 'Alice',
			avatarUrl: 'https://example.com/avatar.png',
			expiresAt: '2099-01-01T00:00:00.000Z'
		})

		await expect(service.getChallenge('ticket-1')).resolves.toEqual({
			flow: 'verified_email_signup',
			provider: 'github-sso',
			email: 'alice@example.com',
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

	it('forwards the invitation code when an SSO user creates a new account', async () => {
		pendingSsoBindingChallengeService.get.mockResolvedValue({
			ticket: 'ticket-1',
			flow: 'anonymous_bind',
			provider: 'lark',
			subjectId: 'union-1',
			tenantId: 'tenant-1',
			organizationId: 'org-1',
			expiresAt: '2099-01-01T00:00:00.000Z'
		})
		accountBindingService.resolveUser.mockResolvedValue(null)
		accountBindingService.getUserBinding.mockResolvedValue(null)
		accountBindingService.bindUser.mockResolvedValue({
			provider: 'lark',
			subjectId: 'union-1'
		})
		authService.register.mockResolvedValue({
			id: 'user-1'
		})
		authService.issueTokensForUser.mockResolvedValue({
			jwt: 'jwt-token',
			refreshToken: 'refresh-token',
			userId: 'user-1'
		})

		await service.registerAndBind(
			{
				ticket: 'ticket-1',
				email: 'new.user@example.com',
				password: 'secret',
				confirmPassword: 'secret',
				referralCode: 'ABC234DEFG'
			},
			LanguagesEnum.English
		)

		expect(authService.register).toHaveBeenCalledWith(
			expect.objectContaining({
				referralCode: 'ABC234DEFG',
				organizationId: 'org-1'
			}),
			LanguagesEnum.English
		)
	})

	it('completes verified-email signup using only the email stored in the ticket', async () => {
		pendingSsoBindingChallengeService.get.mockResolvedValue({
			ticket: 'ticket-1',
			flow: 'verified_email_signup',
			provider: 'github-sso',
			subjectId: '123',
			tenantId: 'tenant-1',
			verifiedEmail: 'alice@example.com',
			displayName: 'Alice',
			avatarUrl: 'https://example.com/avatar.png',
			profile: {
				login: 'alice'
			},
			returnTo: '/projects/demo',
			expiresAt: '2099-01-01T00:00:00.000Z'
		})
		authService.registerVerifiedExternalIdentity.mockResolvedValue({
			user: {
				id: 'user-1'
			},
			created: true
		})
		authService.issueTokensForUser.mockResolvedValue({
			jwt: 'jwt-token',
			refreshToken: 'refresh-token',
			userId: 'user-1'
		})

		await expect(
			service.registerAndBind(
				{
					ticket: 'ticket-1',
					email: 'ALICE@example.com',
					password: 'secret',
					confirmPassword: 'secret',
					referralCode: 'ABC234DEFG'
				},
				LanguagesEnum.English
			)
		).resolves.toEqual({
			location:
				'/sign-in/success?jwt=jwt-token&refreshToken=refresh-token&userId=user-1&returnTo=%2Fprojects%2Fdemo'
		})

		expect(authService.registerVerifiedExternalIdentity).toHaveBeenCalledWith(
			{
				provider: 'github-sso',
				subjectId: '123',
				tenantId: 'tenant-1',
				verifiedEmail: 'alice@example.com',
				displayName: 'Alice',
				avatarUrl: 'https://example.com/avatar.png',
				profile: {
					login: 'alice'
				},
				returnTo: '/projects/demo',
				password: 'secret',
				confirmPassword: 'secret',
				referralCode: 'ABC234DEFG'
			},
			LanguagesEnum.English
		)
		expect(pendingSsoBindingChallengeService.consume).toHaveBeenCalledWith('ticket-1')
		expect(authService.issueTokensForUser).toHaveBeenCalledTimes(1)
	})

	it('rejects a changed email and preserves the verified-email signup ticket', async () => {
		pendingSsoBindingChallengeService.get.mockResolvedValue({
			ticket: 'ticket-1',
			flow: 'verified_email_signup',
			provider: 'github-sso',
			subjectId: '123',
			tenantId: 'tenant-1',
			verifiedEmail: 'alice@example.com',
			expiresAt: '2099-01-01T00:00:00.000Z'
		})

		await expect(
			service.registerAndBind(
				{
					ticket: 'ticket-1',
					email: 'mallory@example.com',
					password: 'secret',
					confirmPassword: 'secret'
				},
				LanguagesEnum.English
			)
		).rejects.toBeInstanceOf(BadRequestException)
		expect(authService.registerVerifiedExternalIdentity).not.toHaveBeenCalled()
		expect(pendingSsoBindingChallengeService.consume).not.toHaveBeenCalled()
	})

	it('preserves the verified-email signup ticket when registration validation fails', async () => {
		pendingSsoBindingChallengeService.get.mockResolvedValue({
			ticket: 'ticket-1',
			flow: 'verified_email_signup',
			provider: 'github-sso',
			subjectId: '123',
			tenantId: 'tenant-1',
			verifiedEmail: 'alice@example.com',
			expiresAt: '2099-01-01T00:00:00.000Z'
		})
		authService.registerVerifiedExternalIdentity.mockRejectedValue(
			new BadRequestException('The invitation code is invalid.')
		)

		await expect(
			service.registerAndBind(
				{
					ticket: 'ticket-1',
					password: 'secret',
					confirmPassword: 'secret',
					referralCode: 'INVALID'
				},
				LanguagesEnum.English
			)
		).rejects.toBeInstanceOf(BadRequestException)
		expect(pendingSsoBindingChallengeService.consume).not.toHaveBeenCalled()
	})

	it('rejects a concurrent replay before issuing another login token', async () => {
		pendingSsoBindingChallengeService.get.mockResolvedValue({
			ticket: 'ticket-1',
			flow: 'verified_email_signup',
			provider: 'github-sso',
			subjectId: '123',
			tenantId: 'tenant-1',
			verifiedEmail: 'alice@example.com',
			expiresAt: '2099-01-01T00:00:00.000Z'
		})
		pendingSsoBindingChallengeService.consume.mockResolvedValue(null)
		authService.registerVerifiedExternalIdentity.mockResolvedValue({
			user: {
				id: 'user-1'
			},
			created: false
		})

		await expect(
			service.registerAndBind(
				{
					ticket: 'ticket-1',
					password: 'secret',
					confirmPassword: 'secret'
				},
				LanguagesEnum.English
			)
		).rejects.toBeInstanceOf(BadRequestException)
		expect(authService.issueTokensForUser).not.toHaveBeenCalled()
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
			flow: 'current_user_confirm',
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

		await expect(service.getCurrentUserChallenge('ticket-1')).rejects.toBeInstanceOf(BadRequestException)
	})
})
