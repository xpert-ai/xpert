import { RolesEnum } from '@metad/contracts'
import { UserOrganizationService } from './user-organization.services'

describe('UserOrganizationService', () => {
	it('creates only missing memberships for super admins', async () => {
		const userOrganizationRepository = {
			find: jest.fn().mockResolvedValue([
				{ tenantId: 'tenant-1', userId: 'user-1', organizationId: 'org-a' },
				{ tenantId: 'tenant-1', userId: 'user-1', organizationId: 'org-b' }
			]),
			save: jest.fn().mockImplementation(async (entities) => entities),
			create: jest.fn().mockImplementation((entity) => entity)
		}
		const organizationRepository = {
			find: jest.fn().mockResolvedValue([{ id: 'org-a' }, { id: 'org-b' }, { id: 'org-c' }])
		}
		const service = new UserOrganizationService(
			userOrganizationRepository as any,
			organizationRepository as any
		)

		const result = await service.addUserToOrganization(
			{
				id: 'user-1',
				tenantId: 'tenant-1',
				role: { name: RolesEnum.SUPER_ADMIN }
			} as any,
			'org-c'
		)

		expect(userOrganizationRepository.save).toHaveBeenCalledTimes(1)
		expect(userOrganizationRepository.save).toHaveBeenCalledWith([
			{ tenantId: 'tenant-1', userId: 'user-1', organizationId: 'org-c' }
		])
		expect(result).toHaveLength(3)
		expect((result as any[]).map((item) => item.organizationId)).toEqual(['org-a', 'org-b', 'org-c'])
	})

	it('returns the existing membership for a regular user without duplicating it', async () => {
		const existingMembership = { tenantId: 'tenant-1', userId: 'user-1', organizationId: 'org-a' }
		const userOrganizationRepository = {
			find: jest.fn().mockResolvedValue([existingMembership]),
			save: jest.fn(),
			create: jest.fn().mockImplementation((entity) => entity)
		}
		const organizationRepository = {
			find: jest.fn()
		}
		const service = new UserOrganizationService(
			userOrganizationRepository as any,
			organizationRepository as any
		)

		const result = await service.addUserToOrganization(
			{
				id: 'user-1',
				tenantId: 'tenant-1',
				role: { name: RolesEnum.EMPLOYEE }
			} as any,
			'org-a'
		)

		expect(userOrganizationRepository.save).not.toHaveBeenCalled()
		expect(result).toEqual(existingMembership)
	})
})
