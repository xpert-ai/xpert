export {}

jest.mock('../core/context', () => ({
	RequestContext: {
		currentTenantId: jest.fn()
	}
}))

jest.mock('./organization.entity', () => ({
	Organization: class Organization {}
}))

jest.mock('../core/entities/internal', () => ({
	Invite: class Invite {},
	UserGroup: class UserGroup {}
}))

jest.mock('./commands', () => ({
	OrganizationDemoCommand: class OrganizationDemoCommand {
		constructor(public readonly input: unknown) {}
	}
}))

jest.mock('../user-organization/user-organization.services', () => ({
	UserOrganizationService: class UserOrganizationService {}
}))

jest.mock('../core/crud', () => ({
	TenantAwareCrudService: class TenantAwareCrudService<T> {
		protected repository: any

		constructor(repository: any) {
			this.repository = repository
		}

		async delete(criteria: any, options?: any) {
			return this.repository.delete(criteria, options)
		}
	}
}))

const { RequestContext } = require('../core/context')
const { OrganizationService } = require('./organization.service')

describe('OrganizationService', () => {
	let service: InstanceType<typeof OrganizationService>

	const organizationRepository = {
		findOne: jest.fn(),
		delete: jest.fn()
	}
	const inviteRepository = {
		count: jest.fn()
	}
	const userGroupRepository = {
		count: jest.fn()
	}
	const userOrganizationService = {
		deleteByOrganizationForOrganizationRemoval: jest.fn()
	}
	const commandBus = {
		execute: jest.fn()
	}

	beforeEach(() => {
		jest.clearAllMocks()
		RequestContext.currentTenantId.mockReturnValue('tenant-1')

		organizationRepository.findOne.mockResolvedValue({
			id: 'org-1',
			tenantId: 'tenant-1'
		})
		organizationRepository.delete.mockResolvedValue({ affected: 1 })
		inviteRepository.count.mockResolvedValue(0)
		userGroupRepository.count.mockResolvedValue(0)
		userOrganizationService.deleteByOrganizationForOrganizationRemoval.mockResolvedValue({ affected: 2 })

		service = new OrganizationService(
			organizationRepository as any,
			inviteRepository as any,
			userGroupRepository as any,
			userOrganizationService as any,
			commandBus as any
		)
	})

	it('removes organization memberships in bulk before deleting the organization', async () => {
		await service.delete('org-1')
		expect(userOrganizationService.deleteByOrganizationForOrganizationRemoval).toHaveBeenCalledWith({
			tenantId: 'tenant-1',
			organizationId: 'org-1'
		})
		expect(organizationRepository.delete).toHaveBeenCalledWith('org-1', undefined)
		expect(
			userOrganizationService.deleteByOrganizationForOrganizationRemoval.mock.invocationCallOrder[0]
		).toBeLessThan(organizationRepository.delete.mock.invocationCallOrder[0])
	})
})
