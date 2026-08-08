import type { Permissions } from '@xpert-ai/plugin-sdk'
import { BOUND_IDENTITY_LOGIN_PERMISSION_SERVICE_TOKEN } from '@xpert-ai/plugin-sdk'

const { assertPermissionForToken } = require('./index')
const {
	createGuardedBoundIdentityLoginPermissionService,
	PluginBoundIdentityLoginPermissionService
} = require('./bound-identity-login-permission')

describe('Bound identity login plugin permissions', () => {
	let accountBindingService: {
		resolveUser: jest.Mock
	}
	let authService: {
		issueTokensForUser: jest.Mock
		resolveOrBindVerifiedEmail: jest.Mock
	}
	let pendingSsoBindingChallengeService: {
		createVerifiedEmailSignup: jest.Mock
	}
	let moduleRef: {
		get: jest.Mock
	}
	let service: InstanceType<typeof PluginBoundIdentityLoginPermissionService>

	beforeEach(() => {
		jest.clearAllMocks()
		accountBindingService = {
			resolveUser: jest.fn().mockResolvedValue({
				id: 'user-1'
			})
		}
		authService = {
			issueTokensForUser: jest.fn().mockResolvedValue({
				jwt: 'jwt-token',
				refreshToken: 'refresh-token',
				userId: 'user-1'
			}),
			resolveOrBindVerifiedEmail: jest.fn().mockResolvedValue({
				id: 'user-1'
			})
		}
		pendingSsoBindingChallengeService = {
			createVerifiedEmailSignup: jest.fn().mockResolvedValue({
				ticket: 'ticket-1'
			})
		}
		moduleRef = {
			get: jest.fn((token: unknown) => {
				const tokenName = token && typeof token === 'function' ? token.name : ''
				if (tokenName === 'AccountBindingService') {
					return accountBindingService
				}
				if (tokenName === 'AuthService') {
					return authService
				}
				if (tokenName === 'PendingSsoBindingChallengeService') {
					return pendingSsoBindingChallengeService
				}
				return null
			})
		}
		service = new PluginBoundIdentityLoginPermissionService(moduleRef as any)
	})

	it('blocks token resolution when bound_identity_login permission is not declared', () => {
		expect(() =>
			assertPermissionForToken('demo-plugin', BOUND_IDENTITY_LOGIN_PERMISSION_SERVICE_TOKEN, new Set(['user']))
		).toThrow(/without declaring 'bound_identity_login' permission/)
	})

	it('denies calls when bound_identity_login.create is not declared', () => {
		const guardedService = createGuardedBoundIdentityLoginPermissionService('demo-plugin', service, [
				{
					type: 'bound_identity_login',
					operations: ['read' as any]
				}
		] as Permissions)

		expect(() =>
			guardedService.loginWithBoundIdentity({
				provider: 'lark',
				subjectId: 'union-1',
				tenantId: 'tenant-1'
			})
		).toThrow(/operation 'create'/)
	})

	it('keeps omitted operations backward compatible with create only', () => {
		const guardedService = createGuardedBoundIdentityLoginPermissionService('demo-plugin', service, [
			{
				type: 'bound_identity_login',
				providers: ['github-sso']
			}
		] as Permissions)

		expect(() =>
			guardedService.loginOrPrepareVerifiedEmail({
				provider: 'github-sso',
				subjectId: '123',
				tenantId: 'tenant-1',
				verifiedEmail: 'alice@example.com'
			})
		).toThrow(/operation 'provision'/)
	})

	it('denies calls for undeclared providers', async () => {
		const guardedService = createGuardedBoundIdentityLoginPermissionService('demo-plugin', service, [
				{
					type: 'bound_identity_login',
					operations: ['create'],
					providers: ['github']
				}
		] as Permissions)

		expect(() =>
			guardedService.loginWithBoundIdentity({
				provider: 'lark',
				subjectId: 'union-1',
				tenantId: 'tenant-1'
			})
		).toThrow(/without declaring it in 'bound_identity_login.providers'/)
	})

	it('returns null when no eligible bound user exists', async () => {
		accountBindingService.resolveUser.mockResolvedValue(null)

		await expect(
			service.loginWithBoundIdentity({
				provider: 'lark',
				subjectId: 'union-1',
				tenantId: 'tenant-1'
			})
		).resolves.toBeNull()
		expect(authService.issueTokensForUser).not.toHaveBeenCalled()
	})

	it('issues tokens only after resolving the bound user in the host', async () => {
		const guardedService = createGuardedBoundIdentityLoginPermissionService('demo-plugin', service, [
				{
					type: 'bound_identity_login',
					operations: ['create'],
					providers: ['lark']
				}
		] as Permissions)

		await expect(
			guardedService.loginWithBoundIdentity({
				provider: 'lark',
				subjectId: 'union-1',
				tenantId: 'tenant-1',
				organizationId: 'org-1'
			})
		).resolves.toEqual({
			jwt: 'jwt-token',
			refreshToken: 'refresh-token',
			userId: 'user-1'
		})
		expect(accountBindingService.resolveUser).toHaveBeenCalledWith({
			tenantId: 'tenant-1',
			provider: 'lark',
			subjectId: 'union-1'
		})
		expect(authService.issueTokensForUser).toHaveBeenCalledWith('user-1')
	})

	it('guards the provision method by provider and returns host-issued tokens', async () => {
		const guardedService = createGuardedBoundIdentityLoginPermissionService('demo-plugin', service, [
			{
				type: 'bound_identity_login',
				operations: ['provision'],
				providers: ['github-sso']
			}
		] as Permissions)

		expect(() =>
			guardedService.loginOrPrepareVerifiedEmail({
				provider: 'lark',
				subjectId: '123',
				tenantId: 'tenant-1',
				verifiedEmail: 'alice@example.com'
})
		).toThrow(/without declaring it in 'bound_identity_login.providers'/)

		await expect(
			guardedService.loginOrPrepareVerifiedEmail({
				provider: 'github-sso',
				subjectId: '123',
				tenantId: 'tenant-1',
				verifiedEmail: 'alice@example.com'
			})
		).resolves.toEqual({
			status: 'authenticated',
			tokens: {
				jwt: 'jwt-token',
				refreshToken: 'refresh-token',
				userId: 'user-1'
			}
		})
		expect(authService.resolveOrBindVerifiedEmail).toHaveBeenCalledWith({
			provider: 'github-sso',
			subjectId: '123',
			tenantId: 'tenant-1',
			verifiedEmail: 'alice@example.com'
		})
	})

	it('creates a host-owned signup ticket when no account matches', async () => {
		authService.resolveOrBindVerifiedEmail.mockResolvedValue(null)

		await expect(
			service.loginOrPrepareVerifiedEmail({
				provider: 'github-sso',
				subjectId: '123',
				tenantId: 'tenant-1',
				verifiedEmail: 'alice@example.com',
				returnTo: '/projects/demo'
			})
		).resolves.toEqual({
			status: 'registration_required',
			ticket: 'ticket-1'
		})
		expect(pendingSsoBindingChallengeService.createVerifiedEmailSignup).toHaveBeenCalledWith({
			provider: 'github-sso',
			subjectId: '123',
			tenantId: 'tenant-1',
			verifiedEmail: 'alice@example.com',
			returnTo: '/projects/demo'
		})
	})
})
