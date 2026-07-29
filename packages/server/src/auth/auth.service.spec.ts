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

jest.mock('../organization/organization.service', () => ({
	OrganizationService: class OrganizationService {}
}))

jest.mock('../organization/organization.entity', () => ({
	Organization: class Organization {}
}))

jest.mock('../referral', () => ({
	ReferralService: class ReferralService {}
}))

const { AuthService } = require('./auth.service')

describe('AuthService', () => {
	let service: InstanceType<typeof AuthService>

	const userService = {
		findOne: jest.fn(),
		findOneOrFailByOptions: jest.fn(),
		findOneByOptions: jest.fn(),
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
		addUserToOrganization: jest.fn(),
		ensureMembershipInTransaction: jest.fn(),
		completeMembershipCreation: jest.fn()
	}
	const i18n = {
		translate: jest.fn()
	}
	const configService = {}
	const commandBus = {}
	const userRepository = {
		create: jest.fn((entity) => entity),
		save: jest.fn(),
		findOne: jest.fn()
	}
	const organizationRepository = {
		findOne: jest.fn()
	}
	const manager = {
		getRepository: jest.fn((entity) => {
			switch (entity?.name) {
				case 'User':
					return userRepository
				case 'Organization':
					return organizationRepository
				default:
					throw new Error(`Unexpected repository: ${entity?.name}`)
			}
		})
	}
	const dataSource = {
		transaction: jest.fn((callback) => callback(manager))
	}
	const referralService = {
		bindRegistration: jest.fn()
	}

	beforeEach(() => {
		jest.clearAllMocks()

		service = new AuthService(
			userService as never,
			roleService as never,
			organizationService as never,
			emailService as never,
			userOrganizationService as never,
			i18n as never,
			configService as never,
			commandBus as never,
			dataSource as never,
			referralService as never
		)

		userRepository.save.mockImplementation(async (entity) => ({
			...entity,
			id: entity.id ?? 'user-1'
		}))
		userRepository.findOne.mockResolvedValueOnce(null).mockResolvedValue({
			id: 'user-1',
			email: 'new.user@example.com',
			tenantId: 'tenant-1',
			tenant: {
				id: 'tenant-1'
			},
			role: {
				name: 'ADMIN'
			}
		})
		organizationRepository.findOne.mockResolvedValue({ id: 'org-default' })
		userOrganizationService.ensureMembershipInTransaction.mockResolvedValue({
			membership: {
				id: 'membership-1'
			},
			created: true
		})
		userOrganizationService.completeMembershipCreation.mockResolvedValue(undefined)
		referralService.bindRegistration.mockResolvedValue(undefined)
		organizationService.findOneByOptions.mockResolvedValue({ id: 'org-default' })

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
		userService.findOneByOptions.mockResolvedValue(null)
	})

	it('assigns the tenant default organization when organizationId is not provided', async () => {
		await service.register(
			{
				user: {
					email: 'New.User@example.com',
					tenant: {
						id: 'tenant-1'
					}
				}
			} as never,
			'en-US'
		)

		expect(organizationRepository.findOne).toHaveBeenCalledWith({
			select: {
				id: true
			},
			where: {
				tenantId: 'tenant-1',
				isDefault: true,
				isActive: true
			}
		})
		expect(userOrganizationService.ensureMembershipInTransaction).toHaveBeenCalledWith(manager, {
			organizationId: 'org-default',
			tenantId: 'tenant-1',
			userId: 'user-1'
		})
		expect(userOrganizationService.completeMembershipCreation).toHaveBeenCalledWith({
			organizationId: 'org-default',
			tenantId: 'tenant-1',
			userId: 'user-1'
		})
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
			} as never,
			'en-US'
		)

		expect(organizationRepository.findOne).not.toHaveBeenCalled()
		expect(userOrganizationService.ensureMembershipInTransaction).toHaveBeenCalledWith(manager, {
			organizationId: 'org-explicit',
			tenantId: 'tenant-1',
			userId: 'user-1'
		})
		expect(emailService.welcomeUser).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'user-1' }),
			'en-US',
			'org-explicit',
			undefined
		)
	})

	it('publishes organization membership side effects only after referral binding succeeds', async () => {
		await service.register(
			{
				user: {
					email: 'New.User@example.com',
					tenant: {
						id: 'tenant-1'
					}
				},
				organizationId: 'org-explicit',
				referralCode: 'ABC234DEFG'
			} as never,
			'en-US'
		)

		expect(referralService.bindRegistration).toHaveBeenCalledWith(manager, {
			tenantId: 'tenant-1',
			referredUserId: 'user-1',
			referralCode: 'ABC234DEFG'
		})
		expect(referralService.bindRegistration.mock.invocationCallOrder[0]).toBeLessThan(
			userOrganizationService.completeMembershipCreation.mock.invocationCallOrder[0]
		)
	})

	it('does not publish organization membership side effects when referral binding fails', async () => {
		referralService.bindRegistration.mockRejectedValueOnce(new Error('invalid referral'))

		await expect(
			service.register(
				{
					user: {
						email: 'New.User@example.com',
						tenant: {
							id: 'tenant-1'
						}
					},
					organizationId: 'org-explicit',
					referralCode: 'INVALID'
				} as never,
				'en-US'
			)
		).rejects.toThrow('invalid referral')

		expect(userOrganizationService.completeMembershipCreation).not.toHaveBeenCalled()
		expect(emailService.welcomeUser).not.toHaveBeenCalled()
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
		const updateRefreshTokenSpy = jest.spyOn(service, 'updateRefreshToken').mockResolvedValue(undefined)

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
