jest.mock('../../../user/events', () => ({
	EVENT_USER_ORGANIZATION_DELETED: 'user.organization.deleted',
	UserOrganizationDeletedEvent: class UserOrganizationDeletedEvent {
		constructor(
			public readonly tenantId: string,
			public readonly organizationId: string,
			public readonly userId: string
		) {}
	}
}))

jest.mock('../../user-organization.services', () => ({
	UserOrganizationService: class UserOrganizationService {}
}))

jest.mock('../../../user/user.service', () => ({
	UserService: class UserService {}
}))

jest.mock('../../../role/role.service', () => ({
	RoleService: class RoleService {}
}))

import { UserOrganizationDeleteHandler } from './user-organization.delete.handler'

describe('UserOrganizationDeleteHandler', () => {
	function createHandler() {
		const userOrganizationService = {
			delete: jest.fn(),
			findAll: jest.fn(),
			findOne: jest.fn()
		}
		const userService = {
			delete: jest.fn(),
			findAll: jest.fn()
		}
		const roleService = {
			findOne: jest.fn()
		}
		const i18n = {
			translate: jest.fn()
		}
		const eventEmitter = {
			emit: jest.fn()
		}

		const handler = new UserOrganizationDeleteHandler(
			userOrganizationService as any,
			userService as any,
			roleService as any,
			i18n as any,
			eventEmitter as any
		)

		return {
			eventEmitter,
			handler,
			i18n,
			roleService,
			userOrganizationService,
			userService
		}
	}

	it('emits a deleted event after removing a user from one organization', async () => {
		const { eventEmitter, handler, userOrganizationService } = createHandler()
		userOrganizationService.findOne.mockResolvedValue({
			tenantId: 'tenant-1',
			organizationId: 'org-1',
			userId: 'user-1',
			user: {
				role: {
					name: 'ADMIN'
				}
			}
		})
		userOrganizationService.findAll.mockResolvedValue({
			total: 2
		})
		userOrganizationService.delete.mockResolvedValue({
			affected: 1
		})

		await handler.execute({
			input: {
				userOrganizationId: 'membership-1',
				requestingUser: {
					id: 'requester-1'
				}
			}
		} as any)

		expect(userOrganizationService.delete).toHaveBeenCalledWith('membership-1')
		expect(eventEmitter.emit).toHaveBeenCalledWith(
			'user.organization.deleted',
			expect.objectContaining({
				tenantId: 'tenant-1',
				organizationId: 'org-1',
				userId: 'user-1'
			})
		)
	})

	it('emits one deleted event per organization when removing a super admin user', async () => {
		const { eventEmitter, handler, roleService, userOrganizationService, userService } = createHandler()
		userOrganizationService.findOne.mockResolvedValue({
			tenantId: 'tenant-1',
			organizationId: 'org-1',
			userId: 'user-1',
			user: {
				role: {
					name: 'SUPER_ADMIN'
				}
			}
		})
		userOrganizationService.findAll.mockResolvedValue({
			items: [
				{
					tenantId: 'tenant-1',
					organizationId: 'org-1'
				},
				{
					tenantId: 'tenant-1',
					organizationId: 'org-2'
				}
			]
		})
		roleService.findOne.mockResolvedValue({
			name: 'SUPER_ADMIN'
		})
		userService.findAll.mockResolvedValue({
			total: 2
		})
		userService.delete.mockResolvedValue({
			affected: 1
		})

		await handler.execute({
			input: {
				userOrganizationId: 'membership-1',
				requestingUser: {
					roleId: 'role-1',
					tenantId: 'tenant-1'
				},
				language: 'en'
			}
		} as any)

		expect(userService.delete).toHaveBeenCalledWith('user-1')
		expect(eventEmitter.emit).toHaveBeenCalledTimes(2)
		expect(eventEmitter.emit).toHaveBeenNthCalledWith(
			1,
			'user.organization.deleted',
			expect.objectContaining({
				organizationId: 'org-1',
				userId: 'user-1'
			})
		)
		expect(eventEmitter.emit).toHaveBeenNthCalledWith(
			2,
			'user.organization.deleted',
			expect.objectContaining({
				organizationId: 'org-2',
				userId: 'user-1'
			})
		)
	})
})
