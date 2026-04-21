export {}

jest.mock('@xpert-ai/server-auth', () => ({
	SocialAuthService: class SocialAuthService {
		async getPasswordHash(password: string) {
			return `hashed:${password}`
		}
	}
}))

jest.mock('@xpert-ai/server-config', () => ({
	environment: {
		clientBaseUrl: 'http://localhost',
		JWT_SECRET: 'test-secret'
	}
}))

jest.mock('../core/entities/internal', () => ({
	Organization: class Organization {}
}))

jest.mock('../email/email.service', () => ({
	EmailService: class EmailService {}
}))

jest.mock('../user-organization/user-organization.services', () => ({
	UserOrganizationService: class UserOrganizationService {}
}))

jest.mock('../user/user.entity', () => ({
	User: class User {}
}))

jest.mock('../user/user.service', () => ({
	UserService: class UserService {}
}))

jest.mock('../role/role.service', () => ({
	RoleService: class RoleService {}
}))

jest.mock('../organization', () => ({
	OrganizationService: class OrganizationService {}
}))

const { AuthService } = require('./auth.service')

describe('AuthService', () => {
	let service: InstanceType<typeof AuthService>

	const userService = {
		findOne: jest.fn(),
		findOneOrFailByOptions: jest.fn(),
		create: jest.fn(),
		update: jest.fn()
	}
	const roleService = {}
	const organizationService = {
		findOneByOptions: jest.fn()
	}
	const emailService = {
		welcomeUser: jest.fn()
	}
	const userOrganizationService = {
		addUserToOrganization: jest.fn()
	}
	const i18n = {
		translate: jest.fn()
	}
	const configService = {}
	const commandBus = {}

	beforeEach(() => {
		jest.clearAllMocks()

		service = new AuthService(
			userService as any,
			roleService as any,
			organizationService as any,
			emailService as any,
			userOrganizationService as any,
			i18n as any,
			configService as any,
			commandBus as any
		)

		userService.findOneOrFailByOptions.mockResolvedValue({ success: false })
		userService.create.mockResolvedValue({
			id: 'user-1',
			email: 'new.user@example.com'
		})
		userService.findOne.mockResolvedValue({
			id: 'user-1',
			email: 'new.user@example.com',
			tenantId: 'tenant-1',
			role: {
				name: 'ADMIN'
			}
		})
	})

	it('assigns the tenant default organization when organizationId is not provided', async () => {
		organizationService.findOneByOptions.mockResolvedValue({ id: 'org-default' })

		await service.register(
			{
				user: {
					email: 'New.User@example.com',
					tenant: {
						id: 'tenant-1'
					}
				}
			} as any,
			'en-US'
		)

		expect(organizationService.findOneByOptions).toHaveBeenCalledWith({
			select: ['id'],
			where: {
				tenantId: 'tenant-1',
				isDefault: true,
				isActive: true
			}
		})
		expect(userOrganizationService.addUserToOrganization).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'user-1' }),
			'org-default'
		)
		expect(emailService.welcomeUser).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'user-1' }),
			'en-US',
			'org-default',
			undefined
		)
	})

	it('keeps the explicit organizationId when one is provided', async () => {
		await service.register(
			{
				user: {
					email: 'New.User@example.com',
					tenant: {
						id: 'tenant-1'
					}
				},
				organizationId: 'org-explicit'
			} as any,
			'en-US'
		)

		expect(organizationService.findOneByOptions).not.toHaveBeenCalled()
		expect(userOrganizationService.addUserToOrganization).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'user-1' }),
			'org-explicit'
		)
		expect(emailService.welcomeUser).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'user-1' }),
			'en-US',
			'org-explicit',
			undefined
		)
	})

	it('issues tokens for an existing user and updates the refresh token', async () => {
		userService.findOne.mockResolvedValue({
			id: 'user-1',
			email: 'new.user@example.com',
			tenantId: 'tenant-1'
		})
		const createTokenSpy = jest.spyOn(service, 'createToken').mockResolvedValue({
			token: 'jwt-token',
			refreshToken: 'refresh-token'
		})
		const updateRefreshTokenSpy = jest
			.spyOn(service, 'updateRefreshToken')
			.mockResolvedValue(undefined)

		await expect(service.issueTokensForUser('user-1')).resolves.toEqual({
			jwt: 'jwt-token',
			refreshToken: 'refresh-token',
			userId: 'user-1'
		})
		expect(createTokenSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 'user-1'
			})
		)
		expect(updateRefreshTokenSpy).toHaveBeenCalledWith('user-1', 'refresh-token')
	})

	it('throws when issuing tokens for a missing user', async () => {
		userService.findOne.mockResolvedValue(null)

		await expect(service.issueTokensForUser('missing-user')).rejects.toThrow(
			"The user 'missing-user' was not found"
		)
	})
})
