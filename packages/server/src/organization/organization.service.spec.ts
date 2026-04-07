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
	UserGroup: class UserGroup {},
	UserOrganization: class UserOrganization {}
}))

jest.mock('./commands', () => ({
	OrganizationDemoCommand: class OrganizationDemoCommand {
		constructor(public readonly input: unknown) {}
	}
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

const { BadRequestException } = require('@nestjs/common')
const { RolesEnum } = require('@metad/contracts')
const { RequestContext } = require('../core/context')
const { OrganizationService } = require('./organization.service')

describe('OrganizationService', () => {
	let service: InstanceType<typeof OrganizationService>

	const organizationRepository = {
		findOne: jest.fn(),
		delete: jest.fn()
	}
	const userOrganizationRepository = {
		find: jest.fn()
	}
	const inviteRepository = {
		count: jest.fn()
	}
	const userGroupRepository = {
		count: jest.fn()
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

		service = new OrganizationService(
			organizationRepository as any,
			userOrganizationRepository as any,
			inviteRepository as any,
			userGroupRepository as any,
			commandBus as any
		)
	})

	it('allows deleting an organization when only super admins remain as members', async () => {
		userOrganizationRepository.find.mockResolvedValue([
			{
				user: {
					role: {
						name: RolesEnum.SUPER_ADMIN
					}
				}
			}
		])

		await service.delete('org-1')

		expect(userOrganizationRepository.find).toHaveBeenCalledWith({
			where: {
				tenantId: 'tenant-1',
				organizationId: 'org-1'
			},
			relations: ['user', 'user.role']
		})
		expect(organizationRepository.delete).toHaveBeenCalledWith('org-1', undefined)
	})

	it('rejects deleting an organization when non-super-admin members still exist', async () => {
		userOrganizationRepository.find.mockResolvedValue([
			{
				user: {
					role: {
						name: RolesEnum.EMPLOYEE
					}
				}
			}
		])

		await expect(service.delete('org-1')).rejects.toThrow(BadRequestException)
		expect(organizationRepository.delete).not.toHaveBeenCalled()
	})
})
