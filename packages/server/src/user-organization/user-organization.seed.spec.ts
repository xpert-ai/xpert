import type { Connection } from 'typeorm'
import {
	RolesEnum,
	type IOrganization,
	type ISeedUsers,
	type ITenant,
	type IUser,
	type IUserOrganization
} from '@xpert-ai/contracts'
import { createDefaultUsersOrganizations, createRandomUsersOrganizations } from './user-organization.seed'

describe('user organization seed helpers', () => {
	function createConnection() {
		const save = jest.fn(async (userOrganizations: IUserOrganization[]) => userOrganizations)
		const connection = {
			manager: {
				save
			}
		} as unknown as Connection

		return { connection, save }
	}

	it('excludes super admins from default organization memberships', async () => {
		const { connection, save } = createConnection()
		const tenant = { id: 'tenant-1' } as ITenant
		const organization = { id: 'org-1' } as IOrganization
		const adminUser = {
			id: 'admin-1',
			role: {
				name: RolesEnum.ADMIN
			}
		} as IUser
		const superAdminUser = {
			id: 'super-admin-1',
			role: {
				name: RolesEnum.SUPER_ADMIN
			}
		} as IUser

		const result = await createDefaultUsersOrganizations(
			connection,
			tenant,
			[organization],
			[superAdminUser, adminUser]
		)

		expect(result).toHaveLength(1)
		expect(save).toHaveBeenCalledWith([
			expect.objectContaining({
				organization,
				tenantId: 'tenant-1',
				user: adminUser
			})
		])
	})

	it('excludes tenant super admins from random organization memberships', async () => {
		const { connection } = createConnection()
		const tenant = { id: 'tenant-1' } as ITenant
		const organization = {
			id: 'org-1',
			tenant
		} as IOrganization
		const employeeUser = { id: 'employee-1' } as IUser
		const adminUser = { id: 'admin-1' } as IUser
		const superAdminUser = { id: 'super-admin-1' } as IUser
		const seedUsers = {
			adminUsers: [adminUser],
			employeeUsers: [employeeUser],
			candidateUsers: []
		} as ISeedUsers

		const result = await createRandomUsersOrganizations(
			connection,
			[tenant],
			new Map([[tenant, [organization]]]),
			new Map([[tenant, [superAdminUser]]]),
			new Map([[tenant, seedUsers]]),
			1
		)

		expect(result.map((membership) => membership.userId)).toEqual(['employee-1', 'admin-1'])
	})
})
