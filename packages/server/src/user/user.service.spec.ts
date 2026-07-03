jest.mock('../core/context', () => ({
	RequestContext: {
		currentUserId: jest.fn(),
		currentTenantId: jest.fn(),
		hasPermission: jest.fn(),
		hasRole: jest.fn()
	}
}))

jest.mock('../core/crud', () => ({
	TenantAwareCrudService: class TenantAwareCrudService<T> {
		protected repository: any

		constructor(repository: any) {
			this.repository = repository
		}

		async softDelete(criteria: any) {
			return this.repository.softDelete?.(criteria)
		}

		async delete(criteria: any) {
			return this.repository.delete?.(criteria)
		}
	}
}))

jest.mock('./user.entity', () => ({
	User: class User {}
}))

jest.mock('./email-verification/email-verification.entity', () => ({
	EmailVerification: class EmailVerification {}
}))

jest.mock('../feature/feature-organization.entity', () => ({
	FeatureOrganization: class FeatureOrganization {}
}))

jest.mock('./dto', () => ({
	UserPublicDTO: class UserPublicDTO {
		constructor(input?: Record<string, unknown>) {
			Object.assign(this, input)
		}
	}
}))

jest.mock('../user-organization/user-organization.services', () => ({
	UserOrganizationService: class UserOrganizationService {}
}))

jest.mock('./events', () => ({
	EVENT_USER_ORGANIZATION_DELETED: 'user.organization.deleted',
	UserOrganizationDeletedEvent: class UserOrganizationDeletedEvent {
		constructor(
			public readonly tenantId: string,
			public readonly organizationId: string,
			public readonly userId: string
		) {}
	}
}))

const { RequestContext } = require('../core/context')
const { RolesEnum } = require('@xpert-ai/contracts')
const { UserService } = require('./user.service')

describe('UserService', () => {
	let service: InstanceType<typeof UserService>

	const userRepository = {
		findOne: jest.fn(),
		createQueryBuilder: jest.fn(),
		softDelete: jest.fn(),
		delete: jest.fn()
	}
	const emailVerificationRepository = {}
	const userOrganizationService = {
		findAll: jest.fn(),
		delete: jest.fn()
	}
	const eventEmitter = {
		emit: jest.fn()
	}
	const featureOrganizationRepository = {
		find: jest.fn()
	}
	const cacheManager = {
		get: jest.fn(),
		set: jest.fn()
	}
	const featureHydrationRelations = [
		'tenant.featureOrganizations',
		'tenant.featureOrganizations.feature',
		'organizations.organization.featureOrganizations',
		'organizations.organization.featureOrganizations.feature'
	]

	beforeEach(() => {
		jest.clearAllMocks()
		RequestContext.currentUserId.mockReturnValue('requester-1')
		RequestContext.currentTenantId.mockReturnValue('tenant-1')
		RequestContext.hasPermission.mockReturnValue(true)
		RequestContext.hasRole.mockReturnValue(false)

		service = new UserService(
			userRepository as any,
			emailVerificationRepository as any,
			userOrganizationService as any,
			eventEmitter as any,
			featureOrganizationRepository,
			cacheManager
		)
	})

	it('loads current user with core relations by default', async () => {
		const user = { id: 'user-1' }

		service.findOne = jest.fn().mockResolvedValue(user)

		const result = await service.findCurrentUser('user-1')

		expect(service.findOne).toHaveBeenCalledWith('user-1', {
			relations: ['employee', 'role', 'role.rolePermissions', 'tenant']
		})
		expect(result).toBe(user)
	})

	it('loads current user with requested relations merged into the core relations', async () => {
		const user = { id: 'user-1' }

		service.findOne = jest.fn().mockResolvedValue(user)

		const result = await service.findCurrentUser('user-1', ['organizations', 'organizations.organization'])

		expect(service.findOne).toHaveBeenCalledWith('user-1', {
			relations: [
				'employee',
				'role',
				'role.rolePermissions',
				'tenant',
				'organizations',
				'organizations.organization'
			]
		})
		expect(result).toBe(user)
	})

	it('passes requested select fields to the original current-user query', async () => {
		const user = { id: 'user-1' }
		const select = {
			id: true,
			email: true,
			organizations: {
				id: true,
				organizationId: true,
				organization: {
					id: true,
					name: true
				}
			}
		}

		service.findOne = jest.fn().mockResolvedValue(user)

		const result = await service.findCurrentUser('user-1', ['organizations', 'organizations.organization'], {
			select
		})

		expect(service.findOne).toHaveBeenCalledWith('user-1', {
			relations: [
				'employee',
				'role',
				'role.rolePermissions',
				'tenant',
				'organizations',
				'organizations.organization'
			],
			select
		})
		expect(result).toBe(user)
	})

	it('limits current user organizations for the bootstrap query when explicitly requested', async () => {
		const user = { id: 'user-1', tenantId: 'tenant-1' }
		const select = {
			id: true,
			email: true,
			organizations: {
				id: true,
				userId: true,
				tenantId: true,
				organizationId: true,
				isDefault: true,
				isActive: true,
				organization: {
					id: true,
					name: true,
					isDefault: true,
					isActive: true
				}
			}
		}
		const membership = {
			id: 'membership-1',
			userId: 'user-1',
			tenantId: 'tenant-1',
			organizationId: 'org-1',
			isDefault: true,
			isActive: true,
			organization: { id: 'org-1', name: 'Org', isActive: true }
		}

		service.findOne = jest.fn().mockResolvedValue(user)
		userOrganizationService.findAll.mockResolvedValue({ items: [membership], total: 1 })

		const result = await service.findCurrentUser('user-1', ['organizations', 'organizations.organization'], {
			select,
			currentOrganizationId: 'org-1',
			limitOrganizations: true
		})

		expect(service.findOne).toHaveBeenCalledWith('user-1', {
			relations: ['employee', 'role', 'role.rolePermissions', 'tenant'],
			select: {
				id: true,
				email: true
			}
		})
		expect(userOrganizationService.findAll).toHaveBeenCalledWith({
			where: {
				userId: 'user-1',
				tenantId: 'tenant-1',
				isActive: true,
				organization: { isActive: true },
				organizationId: 'org-1'
			},
			relations: ['organization'],
			select: select.organizations,
			order: { id: 'ASC' },
			take: 1
		})
		expect(result.organizations).toEqual([membership])
	})

	it('filters limited bootstrap organization queries to active organizations with deterministic ordering', async () => {
		const user = { id: 'user-1', tenantId: 'tenant-1' }

		service.findOne = jest.fn().mockResolvedValue(user)
		userOrganizationService.findAll
			.mockResolvedValueOnce({ items: [], total: 0 })
			.mockResolvedValueOnce({ items: [], total: 0 })
			.mockResolvedValueOnce({ items: [], total: 0 })

		await service.findCurrentUser('user-1', ['organizations', 'organizations.organization'], {
			currentOrganizationId: 'missing-org',
			limitOrganizations: true
		})

		expect(userOrganizationService.findAll).toHaveBeenNthCalledWith(1, {
			where: {
				userId: 'user-1',
				tenantId: 'tenant-1',
				isActive: true,
				organization: { isActive: true },
				organizationId: 'missing-org'
			},
			relations: ['organization'],
			order: { id: 'ASC' },
			take: 1
		})
		expect(userOrganizationService.findAll).toHaveBeenNthCalledWith(2, {
			where: {
				userId: 'user-1',
				tenantId: 'tenant-1',
				isActive: true,
				organization: { isActive: true },
				isDefault: true
			},
			relations: ['organization'],
			order: { id: 'ASC' },
			take: 1
		})
		expect(userOrganizationService.findAll).toHaveBeenNthCalledWith(3, {
			where: {
				userId: 'user-1',
				tenantId: 'tenant-1',
				isActive: true,
				organization: { isActive: true }
			},
			relations: ['organization'],
			order: { id: 'ASC' },
			take: 1
		})
	})

	it('keeps the original current-user query when organization limiting is not explicit', async () => {
		const user = { id: 'user-1' }

		service.findOne = jest.fn().mockResolvedValue(user)

		const result = await service.findCurrentUser('user-1', ['organizations', 'organizations.organization'], {
			limitOrganizations: false
		})

		expect(service.findOne).toHaveBeenCalledWith('user-1', {
			relations: [
				'employee',
				'role',
				'role.rolePermissions',
				'tenant',
				'organizations',
				'organizations.organization'
			]
		})
		expect(userOrganizationService.findAll).not.toHaveBeenCalled()
		expect(result).toBe(user)
	})

	it('keeps unknown current-user relations on the original findOne path', async () => {
		const user = { id: 'user-1' }

		service.findOne = jest.fn().mockResolvedValue(user)

		const result = await service.findCurrentUser('user-1', [...featureHydrationRelations, 'profile'])

		expect(service.findOne).toHaveBeenCalledWith('user-1', {
			relations: ['employee', 'role', 'role.rolePermissions', 'tenant', ...featureHydrationRelations, 'profile']
		})
		expect(featureOrganizationRepository.find).not.toHaveBeenCalled()
		expect(result).toBe(user)
	})

	it('loads known feature hydration relations with split feature queries and preserves response shape', async () => {
		const tenantFeature = {
			id: 'tenant-feature',
			tenantId: 'tenant-1',
			organizationId: null,
			featureId: 'feature-tenant',
			feature: { id: 'feature-tenant', code: 'tenant-feature' },
			isEnabled: true
		}
		const organizationFeature = {
			id: 'organization-feature',
			tenantId: 'tenant-1',
			organizationId: 'org-1',
			featureId: 'feature-org',
			feature: { id: 'feature-org', code: 'org-feature' },
			isEnabled: true
		}
		const coreUser = {
			id: 'user-1',
			tenantId: 'tenant-1',
			tenant: { id: 'tenant-1' },
			organizations: [
				{
					id: 'membership-1',
					organizationId: 'org-1',
					organization: { id: 'org-1', name: 'Org' }
				}
			]
		}

		cacheManager.get.mockResolvedValue(undefined)
		service.findOne = jest.fn().mockResolvedValue(coreUser)
		featureOrganizationRepository.find
			.mockResolvedValueOnce([tenantFeature])
			.mockResolvedValueOnce([organizationFeature])

		const result = await service.findCurrentUser('user-1', featureHydrationRelations)

		expect(service.findOne).toHaveBeenCalledWith('user-1', {
			relations: [
				'employee',
				'role',
				'role.rolePermissions',
				'tenant',
				'organizations',
				'organizations.organization'
			]
		})
		expect(result.tenant.featureOrganizations).toEqual([tenantFeature])
		expect(result.organizations[0].organization.featureOrganizations).toEqual([organizationFeature])
		expect(cacheManager.set).toHaveBeenCalledWith(
			expect.stringContaining('user:me:feature-context:v1:tenant-1:user-1:'),
			{
				tenantFeatureOrganizations: [tenantFeature],
				organizationFeatureOrganizations: [organizationFeature]
			},
			180000
		)
	})

	it('uses cached feature context while still loading a fresh current user shape', async () => {
		const cachedTenantFeature = {
			id: 'tenant-feature',
			tenantId: 'tenant-1',
			organizationId: null,
			featureId: 'feature-tenant',
			feature: { id: 'feature-tenant', code: 'tenant-feature' },
			isEnabled: true
		}
		const cachedOrganizationFeature = {
			id: 'organization-feature',
			tenantId: 'tenant-1',
			organizationId: 'org-1',
			featureId: 'feature-org',
			feature: { id: 'feature-org', code: 'org-feature' },
			isEnabled: true
		}
		const freshUser = {
			id: 'user-1',
			tenantId: 'tenant-1',
			tenant: { id: 'tenant-1', name: 'Updated tenant' },
			role: { rolePermissions: [{ permission: 'updated' }] },
			employee: { id: 'employee-1', name: 'Updated employee' },
			organizations: [
				{
					id: 'membership-1',
					organizationId: 'org-1',
					organization: { id: 'org-1', name: 'Updated org' }
				}
			]
		}

		cacheManager.get.mockImplementation(async (key: string) => {
			if (key.includes(':tenant-version:') || key.includes(':user-version:')) {
				return 'cached-version'
			}
			return {
				tenantFeatureOrganizations: [cachedTenantFeature],
				organizationFeatureOrganizations: [cachedOrganizationFeature]
			}
		})
		service.findOne = jest.fn().mockResolvedValue(freshUser)

		const result = await service.findCurrentUser('user-1', featureHydrationRelations)

		expect(service.findOne).toHaveBeenCalledWith('user-1', {
			relations: [
				'employee',
				'role',
				'role.rolePermissions',
				'tenant',
				'organizations',
				'organizations.organization'
			]
		})
		expect(result.tenant.name).toBe('Updated tenant')
		expect(result.role.rolePermissions).toEqual([{ permission: 'updated' }])
		expect(result.employee.name).toBe('Updated employee')
		expect(result.organizations[0].organization.name).toBe('Updated org')
		expect(result.tenant.featureOrganizations).toEqual([cachedTenantFeature])
		expect(result.organizations[0].organization.featureOrganizations).toEqual([cachedOrganizationFeature])
		expect(featureOrganizationRepository.find).not.toHaveBeenCalled()
	})

	it('includes tenant and user cache versions in the feature hydration cache key', async () => {
		const coreUser = {
			id: 'user-1',
			tenantId: 'tenant-1',
			tenant: { id: 'tenant-1' },
			organizations: []
		}

		cacheManager.get.mockImplementation(async (key: string) => {
			if (key.includes(':tenant-version:')) {
				return 'tenant-version-2'
			}
			if (key.includes(':user-version:')) {
				return 'user-version-7'
			}
			return undefined
		})
		service.findOne = jest.fn().mockResolvedValue(coreUser)
		featureOrganizationRepository.find.mockResolvedValue([])

		await service.findCurrentUser('user-1', featureHydrationRelations)

		expect(cacheManager.set.mock.calls[0][0]).toContain(':tenant-version-2.user-version-7')
	})

	it('treats super admins as having tenant-wide organization access without requiring membership', async () => {
		const queryBuilder = {
			leftJoin: jest.fn().mockReturnThis(),
			where: jest.fn().mockReturnThis(),
			andWhere: jest.fn().mockReturnThis(),
			getCount: jest.fn().mockResolvedValue(1)
		}
		userRepository.createQueryBuilder.mockReturnValue(queryBuilder)

		const result = await service.isActiveMemberOfOrganization('super-admin-1', 'org-1')

		expect(result).toBe(true)
		expect(queryBuilder.leftJoin).toHaveBeenNthCalledWith(1, 'user.role', 'role')
		expect(queryBuilder.leftJoin).toHaveBeenNthCalledWith(
			2,
			'user.organizations',
			'userOrganization',
			'userOrganization.organizationId = :organizationId AND userOrganization.isActive = :isActive',
			{
				organizationId: 'org-1',
				isActive: true
			}
		)
		expect(queryBuilder.andWhere).toHaveBeenCalledWith(expect.anything(), {
			superAdminRole: RolesEnum.SUPER_ADMIN
		})
	})

	it('removes user organizations through the service and emits deletion events before soft deleting the user', async () => {
		userRepository.findOne.mockResolvedValue({
			id: 'user-1',
			tenantId: 'tenant-1',
			role: {
				name: RolesEnum.ADMIN
			}
		})

		const queryBuilder = {
			innerJoin: jest.fn().mockReturnThis(),
			where: jest.fn().mockReturnThis(),
			andWhere: jest.fn().mockReturnThis(),
			getCount: jest.fn().mockResolvedValue(1)
		}
		userRepository.createQueryBuilder.mockReturnValue(queryBuilder)
		userRepository.softDelete.mockResolvedValue({ affected: 1 })

		userOrganizationService.findAll.mockResolvedValue({
			items: [
				{
					id: 'membership-1',
					tenantId: 'tenant-1',
					organizationId: 'org-1',
					userId: 'user-1'
				},
				{
					id: 'membership-2',
					tenantId: 'tenant-1',
					organizationId: 'org-2',
					userId: 'user-1'
				}
			],
			total: 2
		})
		userOrganizationService.delete.mockResolvedValue({ affected: 1 })

		await service.deleteWithGuards('user-1')

		expect(userOrganizationService.findAll).toHaveBeenCalledWith({
			where: {
				userId: 'user-1',
				tenantId: 'tenant-1'
			}
		})
		expect(userOrganizationService.delete).toHaveBeenNthCalledWith(1, 'membership-1', {
			allowDeletingLastMembership: true
		})
		expect(userOrganizationService.delete).toHaveBeenNthCalledWith(2, 'membership-2', {
			allowDeletingLastMembership: true
		})
		expect(eventEmitter.emit).toHaveBeenNthCalledWith(
			1,
			'user.organization.deleted',
			expect.objectContaining({
				tenantId: 'tenant-1',
				organizationId: 'org-1',
				userId: 'user-1'
			})
		)
		expect(eventEmitter.emit).toHaveBeenNthCalledWith(
			2,
			'user.organization.deleted',
			expect.objectContaining({
				tenantId: 'tenant-1',
				organizationId: 'org-2',
				userId: 'user-1'
			})
		)
		expect(userRepository.softDelete).toHaveBeenCalledWith('user-1')
	})

	it('excludes super admins from organization non-member search results', async () => {
		const queryBuilder = {
			leftJoin: jest.fn().mockReturnThis(),
			where: jest.fn().mockReturnThis(),
			andWhere: jest.fn().mockReturnThis(),
			take: jest.fn().mockReturnThis(),
			getManyAndCount: jest.fn().mockResolvedValue([[], 0])
		}
		userRepository.createQueryBuilder.mockReturnValue(queryBuilder)

		const result = await service.search('ada', 'org-1', 'non-members')

		expect(result).toEqual({ items: [], total: 0 })
		expect(queryBuilder.leftJoin).toHaveBeenCalledWith('user.role', 'role')
		expect(queryBuilder.andWhere).toHaveBeenCalledWith('(role.name IS NULL OR role.name != :superAdminRole)', {
			superAdminRole: RolesEnum.SUPER_ADMIN
		})
	})
})
