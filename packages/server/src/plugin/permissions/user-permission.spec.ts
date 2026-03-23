import { RolesEnum } from '@metad/contracts'
import { ModuleRef } from '@nestjs/core'
import { PluginUserPermissionService } from './user-permission'
import { UserOrganizationService } from '../../user-organization/user-organization.services'

describe('PluginUserPermissionService', () => {
	it('ensures super admin memberships through the idempotent add path', async () => {
		const userOrganizationService = {
			addUserToOrganization: jest.fn().mockResolvedValue(undefined),
			findOneByWhereOptions: jest.fn()
		}
		const moduleRef = {
			get: jest.fn().mockImplementation((token: unknown) => {
				if (token === UserOrganizationService) {
					return userOrganizationService
				}
				throw new Error('unexpected provider')
			})
		}
		const service = new PluginUserPermissionService(moduleRef as unknown as ModuleRef)

		await (service as any).ensureOrganizationMembership(
			{
				id: 'user-1',
				tenantId: 'tenant-1',
				role: { name: RolesEnum.SUPER_ADMIN }
			},
			{
				tenantId: 'tenant-1',
				organizationId: 'org-a',
				thirdPartyId: 'third-party-user'
			}
		)

		expect(userOrganizationService.findOneByWhereOptions).not.toHaveBeenCalled()
		expect(userOrganizationService.addUserToOrganization).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 'user-1'
			}),
			'org-a'
		)
	})

	it('keeps the single-organization existence check for regular users', async () => {
		const userOrganizationService = {
			addUserToOrganization: jest.fn(),
			findOneByWhereOptions: jest.fn().mockResolvedValue({
				organizationId: 'org-a'
			})
		}
		const moduleRef = {
			get: jest.fn().mockImplementation((token: unknown) => {
				if (token === UserOrganizationService) {
					return userOrganizationService
				}
				throw new Error('unexpected provider')
			})
		}
		const service = new PluginUserPermissionService(moduleRef as unknown as ModuleRef)

		await (service as any).ensureOrganizationMembership(
			{
				id: 'user-1',
				tenantId: 'tenant-1',
				role: { name: RolesEnum.EMPLOYEE }
			},
			{
				tenantId: 'tenant-1',
				organizationId: 'org-a',
				thirdPartyId: 'third-party-user'
			}
		)

		expect(userOrganizationService.findOneByWhereOptions).toHaveBeenCalledWith({
			tenantId: 'tenant-1',
			userId: 'user-1',
			organizationId: 'org-a'
		})
		expect(userOrganizationService.addUserToOrganization).not.toHaveBeenCalled()
	})
})
