jest.mock('../core/context', () => ({
	RequestContext: {
		currentUserId: jest.fn(),
		currentTenantId: jest.fn(),
		hasPermission: jest.fn()
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

	beforeEach(() => {
		jest.clearAllMocks()
		RequestContext.currentUserId.mockReturnValue('requester-1')
		RequestContext.currentTenantId.mockReturnValue('tenant-1')
		RequestContext.hasPermission.mockReturnValue(true)

		service = new UserService(
			userRepository as any,
			emailVerificationRepository as any,
			userOrganizationService as any,
			eventEmitter as any
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
			relations: ['employee', 'role', 'role.rolePermissions', 'tenant', 'organizations', 'organizations.organization']
		})
		expect(result).toBe(user)
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

})
