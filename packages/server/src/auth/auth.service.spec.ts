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

jest.mock('../account-binding/external-identity-binding.entity', () => ({
	ExternalIdentityBinding: class ExternalIdentityBinding {}
}))

jest.mock('../role/role.entity', () => ({
	Role: class Role {}
}))

jest.mock('../tenant/tenant.entity', () => ({
	Tenant: class Tenant {}
}))

jest.mock('../core/context', () => ({
	RequestContext: {
		currentUserId: jest.fn()
	}
}))

jest.mock('../organization/events', () => ({
	EVENT_ORGANIZATION_CREATED: 'organization.created',
	OrganizationCreatedEvent: class OrganizationCreatedEvent {
		constructor(
			public readonly tenantId: string,
			public readonly organizationId: string,
			public readonly ownerUserId?: string | null
		) {}
	}
}))

const { AuthService } = require('./auth.service')
const { CurrenciesEnum, DefaultValueDateTypeEnum, UserType, RolesEnum } = require('@xpert-ai/contracts')
const { RequestContext } = require('../core/context')
const { EVENT_ORGANIZATION_CREATED } = require('../organization/events')

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
		findOne: jest.fn(),
		createQueryBuilder: jest.fn()
	}
	const organizationRepository = {
		findOne: jest.fn(),
		create: jest.fn((entity) => entity),
		save: jest.fn()
	}
	const tenantRepository = {
		findOne: jest.fn()
	}
	const roleRepository = {
		findOne: jest.fn()
	}
	const bindingRepository = {
		findOne: jest.fn(),
		create: jest.fn((entity) => entity),
		save: jest.fn(async (entity) => ({
			id: entity.id ?? 'binding-1',
			...entity
		}))
	}
	const verifiedEmailQueryBuilder = {
		withDeleted: jest.fn(),
		where: jest.fn(),
		andWhere: jest.fn(),
		orderBy: jest.fn(),
		take: jest.fn(),
		getMany: jest.fn()
	}
	for (const method of ['withDeleted', 'where', 'andWhere', 'orderBy', 'take'] as const) {
		verifiedEmailQueryBuilder[method].mockReturnValue(verifiedEmailQueryBuilder)
	}
	const manager = {
		getRepository: jest.fn((entity) => {
			switch (entity?.name) {
				case 'User':
					return userRepository
				case 'Organization':
					return organizationRepository
				case 'Role':
					return roleRepository
				case 'ExternalIdentityBinding':
					return bindingRepository
				case 'Tenant':
					return tenantRepository
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
	const eventEmitter = {
		emit: jest.fn()
	}

	beforeEach(() => {
		jest.clearAllMocks()
		RequestContext.currentUserId.mockReturnValue(null)

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
			referralService as never,
			eventEmitter as never
		)

		userRepository.save.mockImplementation(async (entity) => ({
			...entity,
			id: entity.id ?? 'user-1'
		}))
		userRepository.createQueryBuilder.mockReturnValue(verifiedEmailQueryBuilder)
		verifiedEmailQueryBuilder.getMany.mockResolvedValue([])
		bindingRepository.findOne.mockResolvedValue(null)
		roleRepository.findOne.mockImplementation(async (options) =>
			options?.where?.tenantId === 'tenant-1' &&
			options?.where?.name === RolesEnum.TRIAL &&
			options?.where?.isSystem === undefined
				? {
						id: 'role-trial',
						name: RolesEnum.TRIAL,
						isSystem: false
					}
				: null
		)
		tenantRepository.findOne.mockResolvedValue({
			id: 'tenant-1'
		})
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
		organizationRepository.save.mockImplementation(async (entity) => ({
			...entity,
			id: entity.id ?? 'org-trial'
		}))
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

	it('resolves an existing external binding before considering the current verified email', async () => {
		bindingRepository.findOne.mockResolvedValueOnce({
			id: 'binding-1',
			tenantId: 'tenant-1',
			provider: 'github-sso',
			subjectId: '123',
			userId: 'user-bound',
			profile: {
				login: 'old-login'
			}
		})
		userRepository.findOne.mockReset()
		userRepository.findOne.mockResolvedValue({
			id: 'user-bound',
			tenantId: 'tenant-1',
			type: UserType.USER,
			hash: 'hashed-password',
			email: 'old-address@example.com',
			emailVerified: true
		})

		await expect(
			service.resolveOrBindVerifiedEmail({
				provider: 'github-sso',
				subjectId: '123',
				tenantId: 'tenant-1',
				verifiedEmail: 'new-address@example.com',
				profile: {
					login: 'new-login'
				}
			})
		).resolves.toEqual(
			expect.objectContaining({
				id: 'user-bound',
				email: 'old-address@example.com'
			})
		)
		expect(verifiedEmailQueryBuilder.getMany).not.toHaveBeenCalled()
		expect(bindingRepository.save).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 'binding-1',
				profile: {
					login: 'new-login'
				}
			})
		)
		expect(userRepository.save).not.toHaveBeenCalled()
	})

	it('binds a unique normalized human account and verifies its email without replacing profile data', async () => {
		const existingUser = {
			id: 'user-existing',
			tenantId: 'tenant-1',
			type: UserType.USER,
			hash: 'hashed-password',
			email: 'alice@example.com',
			emailVerified: false,
			firstName: 'Local Alice',
			imageUrl: 'https://local.example.com/alice.png'
		}
		verifiedEmailQueryBuilder.getMany.mockResolvedValue([existingUser])

		await expect(
			service.resolveOrBindVerifiedEmail({
				provider: 'github-sso',
				subjectId: '123',
				tenantId: 'tenant-1',
				verifiedEmail: ' Alice@Example.com ',
				displayName: 'GitHub Alice',
				avatarUrl: 'https://github.example.com/alice.png',
				profile: {
					login: 'alice'
				}
			})
		).resolves.toEqual(
			expect.objectContaining({
				id: 'user-existing',
				firstName: 'Local Alice',
				imageUrl: 'https://local.example.com/alice.png',
				emailVerified: true
			})
		)
		expect(verifiedEmailQueryBuilder.andWhere).toHaveBeenCalledWith('LOWER(user.email) = :verifiedEmail', {
			verifiedEmail: 'alice@example.com'
		})
		expect(userRepository.save).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 'user-existing',
				emailVerified: true,
				firstName: 'Local Alice',
				imageUrl: 'https://local.example.com/alice.png'
			})
		)
		expect(bindingRepository.save).toHaveBeenCalledWith(
			expect.objectContaining({
				tenantId: 'tenant-1',
				userId: 'user-existing',
				provider: 'github-sso',
				subjectId: '123',
				profile: {
					login: 'alice'
				}
			})
		)
	})

	it.each([
		[
			'duplicate email accounts',
			[
				{
					id: 'user-1',
					tenantId: 'tenant-1',
					type: UserType.USER,
					hash: 'hash-1'
				},
				{
					id: 'user-2',
					tenantId: 'tenant-1',
					type: UserType.USER,
					hash: 'hash-2'
				}
			]
		],
		[
			'a communication account',
			[
				{
					id: 'communication-1',
					tenantId: 'tenant-1',
					type: UserType.COMMUNICATION,
					hash: 'hashed-password'
				}
			]
		]
	])('rejects %s instead of guessing an account', async (_label, matchingUsers) => {
		verifiedEmailQueryBuilder.getMany.mockResolvedValue(matchingUsers)

		await expect(
			service.resolveOrBindVerifiedEmail({
				provider: 'github-sso',
				subjectId: '123',
				tenantId: 'tenant-1',
				verifiedEmail: 'alice@example.com'
			})
		).rejects.toThrow()
		expect(bindingRepository.save).not.toHaveBeenCalled()
	})

	it('allows signup when only a soft-deleted account uses the verified email', async () => {
		verifiedEmailQueryBuilder.getMany.mockResolvedValue([])
		verifiedEmailQueryBuilder.withDeleted.mockImplementationOnce(() => {
			verifiedEmailQueryBuilder.getMany.mockResolvedValueOnce([
				{
					id: 'deleted-1',
					tenantId: 'tenant-1',
					type: UserType.USER,
					hash: 'hashed-password',
					deletedAt: new Date()
				}
			])
			return verifiedEmailQueryBuilder
		})

		await expect(
			service.resolveOrBindVerifiedEmail({
				provider: 'github-sso',
				subjectId: '123',
				tenantId: 'tenant-1',
				verifiedEmail: 'deleted@example.com'
			})
		).resolves.toBeNull()
		expect(bindingRepository.save).not.toHaveBeenCalled()
	})

	it('creates a verified TRIAL account with its own organization, membership, referral, and binding', async () => {
		userRepository.findOne.mockReset()
		const transactionOrder: string[] = []
		organizationRepository.save.mockImplementation(async (entity) => {
			transactionOrder.push('organization')
			return {
				...entity,
				id: 'org-trial'
			}
		})
		userRepository.save.mockImplementation(async (entity) => {
			transactionOrder.push('user')
			return {
				...entity,
				id: 'github-user-1'
			}
		})
		userOrganizationService.ensureMembershipInTransaction.mockImplementation(async () => {
			transactionOrder.push('membership')
			return {
				membership: {
					id: 'membership-1'
				},
				created: true
			}
		})
		referralService.bindRegistration.mockImplementation(async () => {
			transactionOrder.push('referral')
		})
		bindingRepository.save.mockImplementation(async (entity) => {
			transactionOrder.push('binding')
			return {
				id: 'binding-1',
				...entity
			}
		})
		eventEmitter.emit.mockImplementation(() => {
			transactionOrder.push('organization-event')
		})
		userOrganizationService.completeMembershipCreation.mockImplementation(async () => {
			transactionOrder.push('membership-event')
		})

		await expect(
			service.registerVerifiedExternalIdentity(
				{
					provider: 'github-sso',
					subjectId: '123',
					tenantId: 'tenant-1',
					verifiedEmail: ' Alice@Example.com ',
					displayName: 'Alice',
					avatarUrl: 'https://example.com/avatar.png',
					profile: {
						login: 'alice'
					},
					password: 'secret',
					confirmPassword: 'secret',
					referralCode: 'ABC234DEFG'
				},
				'en-US'
			)
		).resolves.toEqual({
			user: expect.objectContaining({
				id: 'github-user-1',
				type: UserType.USER,
				email: 'alice@example.com',
				emailVerified: true,
				firstName: 'Alice',
				imageUrl: 'https://example.com/avatar.png',
				hash: 'hashed:secret',
				role: expect.objectContaining({
					name: RolesEnum.TRIAL
				})
			}),
			created: true
		})

		expect(roleRepository.findOne).toHaveBeenCalledWith({
			where: {
				tenantId: 'tenant-1',
				name: RolesEnum.TRIAL
			}
		})
		expect(tenantRepository.findOne).toHaveBeenCalledWith({
			select: {
				id: true
			},
			where: {
				id: 'tenant-1'
			},
			lock: {
				mode: 'pessimistic_write'
			}
		})
		expect(organizationRepository.create).toHaveBeenCalledWith({
			name: 'Alice',
			tenantId: 'tenant-1',
			currency: CurrenciesEnum.CNY,
			defaultValueDateType: DefaultValueDateTypeEnum.TODAY,
			isDefault: false,
			isActive: true,
			show_profits: false,
			show_bonuses_paid: false,
			show_income: false,
			show_total_hours: false,
			show_projects_count: true,
			show_minimum_project_size: true,
			show_clients_count: true,
			show_clients: true,
			show_employees_count: true
		})
		expect(organizationRepository.findOne).not.toHaveBeenCalled()
		expect(userOrganizationService.ensureMembershipInTransaction).toHaveBeenCalledWith(manager, {
			organizationId: 'org-trial',
			tenantId: 'tenant-1',
			userId: 'github-user-1'
		})
		expect(referralService.bindRegistration).toHaveBeenCalledWith(manager, {
			tenantId: 'tenant-1',
			referredUserId: 'github-user-1',
			referralCode: 'ABC234DEFG'
		})
		expect(bindingRepository.save).toHaveBeenCalledWith(
			expect.objectContaining({
				tenantId: 'tenant-1',
				userId: 'github-user-1',
				provider: 'github-sso',
				subjectId: '123'
			})
		)
		expect(eventEmitter.emit).toHaveBeenCalledWith(
			EVENT_ORGANIZATION_CREATED,
			expect.objectContaining({
				tenantId: 'tenant-1',
				organizationId: 'org-trial',
				ownerUserId: 'github-user-1'
			})
		)
		expect(userOrganizationService.completeMembershipCreation).toHaveBeenCalledWith({
			organizationId: 'org-trial',
			tenantId: 'tenant-1',
			userId: 'github-user-1'
		})
		expect(transactionOrder).toEqual([
			'organization',
			'user',
			'membership',
			'referral',
			'binding',
			'organization-event',
			'membership-event'
		])
	})

	it('uses an account created during completion and ignores password and referral persistence', async () => {
		const racedUser = {
			id: 'raced-user',
			tenantId: 'tenant-1',
			type: UserType.USER,
			hash: 'existing-hash',
			email: 'alice@example.com',
			emailVerified: true
		}
		verifiedEmailQueryBuilder.getMany.mockResolvedValue([racedUser])

		await expect(
			service.registerVerifiedExternalIdentity(
				{
					provider: 'github-sso',
					subjectId: '123',
					tenantId: 'tenant-1',
					verifiedEmail: 'alice@example.com',
					password: 'new-secret',
					confirmPassword: 'new-secret',
					referralCode: 'ABC234DEFG'
				},
				'en-US'
			)
		).resolves.toEqual({
			user: racedUser,
			created: false
		})

		expect(roleRepository.findOne).not.toHaveBeenCalled()
		expect(userRepository.create).not.toHaveBeenCalled()
		expect(userOrganizationService.ensureMembershipInTransaction).not.toHaveBeenCalled()
		expect(referralService.bindRegistration).not.toHaveBeenCalled()
		expect(emailService.welcomeUser).not.toHaveBeenCalled()
		expect(bindingRepository.save).toHaveBeenCalledTimes(1)
	})

	it('rejects a short or mismatched password before opening a signup transaction', async () => {
		dataSource.transaction.mockClear()

		await expect(
			service.registerVerifiedExternalIdentity(
				{
					provider: 'github-sso',
					subjectId: '123',
					tenantId: 'tenant-1',
					verifiedEmail: 'alice@example.com',
					password: 'short',
					confirmPassword: 'short'
				},
				'en-US'
			)
		).rejects.toThrow(/at least 6/)
		await expect(
			service.registerVerifiedExternalIdentity(
				{
					provider: 'github-sso',
					subjectId: '123',
					tenantId: 'tenant-1',
					verifiedEmail: 'alice@example.com',
					password: 'secret',
					confirmPassword: 'different'
				},
				'en-US'
			)
		).rejects.toThrow(/must match/)
		expect(dataSource.transaction).not.toHaveBeenCalled()
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
