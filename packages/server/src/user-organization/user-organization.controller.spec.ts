import { BadRequestException } from '@nestjs/common'
import { LanguagesEnum } from '@xpert-ai/contracts'

jest.mock('@xpert-ai/contracts', () => {
	const actual = jest.requireActual('@xpert-ai/contracts')

	return {
		...actual,
		isUserOrganizationEntryGuideKey: (value: string) => value === 'clawxpert'
	}
})

jest.mock('./../core/crud', () => ({
	CrudController: class CrudController {
		constructor(_crudService: unknown) {}

		findById = jest.fn()
	}
}))

jest.mock('../core/context', () => ({
	RequestContext: {
		hasAnyPermission: jest.fn(),
		requireOrganizationScope: jest.fn()
	}
}))

jest.mock('./user-organization.entity', () => ({
	UserOrganization: class UserOrganization {}
}))

jest.mock('./user-organization.services', () => ({
	UserOrganizationService: class UserOrganizationService {}
}))

jest.mock('../user/user.service', () => ({
	UserService: class UserService {}
}))

jest.mock('./commands', () => ({
	UserOrganizationDeleteCommand: class UserOrganizationDeleteCommand {
		constructor(public readonly input: unknown) {}
	}
}))

jest.mock('./../shared/pipes', () => ({
	ParseJsonPipe: class ParseJsonPipe {},
	UUIDValidationPipe: class UUIDValidationPipe {}
}))

jest.mock('./../shared/guards', () => ({
	PermissionGuard: class PermissionGuard {},
	TenantPermissionGuard: class TenantPermissionGuard {}
}))

jest.mock('./../core/interceptors', () => ({
	TransformInterceptor: class TransformInterceptor {}
}))

import { RequestContext } from '../core/context'
import { UserOrganizationController } from './user-organization.controller'

describe('UserOrganizationController', () => {
	function createController() {
		const userOrganizationService = {
			addUserToOrganization: jest.fn(),
			findAll: jest.fn(),
			findOne: jest.fn(),
			markCurrentUserEntryGuideAutoShown: jest.fn(),
			update: jest.fn()
		}
		const commandBus = {
			execute: jest.fn()
		}
		const userService = {
			findOne: jest.fn()
		}

		const controller = new UserOrganizationController(
			userOrganizationService as unknown as ConstructorParameters<typeof UserOrganizationController>[0],
			commandBus as unknown as ConstructorParameters<typeof UserOrganizationController>[1],
			userService as unknown as ConstructorParameters<typeof UserOrganizationController>[2]
		)

		return {
			commandBus,
			controller,
			userOrganizationService,
			userService
		}
	}

	beforeEach(() => {
		jest.clearAllMocks()
		jest.mocked(RequestContext.hasAnyPermission).mockReturnValue(true)
		jest.mocked(RequestContext.requireOrganizationScope).mockReturnValue('org-1')
	})

	it('marks the current user entry guide through the current membership', async () => {
		const { controller, userOrganizationService } = createController()
		userOrganizationService.markCurrentUserEntryGuideAutoShown.mockResolvedValue({
			id: 'membership-1',
			preferences: {
				entryGuides: {
					clawxpert: {
						autoShownAt: '2026-07-02T00:00:00.000Z'
					}
				}
			}
		})

		const result = await controller.markCurrentUserEntryGuideAutoShown('clawxpert')

		expect(userOrganizationService.markCurrentUserEntryGuideAutoShown).toHaveBeenCalledWith('clawxpert')
		expect(result).toEqual({
			id: 'membership-1',
			preferences: {
				entryGuides: {
					clawxpert: {
						autoShownAt: '2026-07-02T00:00:00.000Z'
					}
				}
			}
		})
	})

	it('rejects unknown current user entry guide keys', async () => {
		const { controller, userOrganizationService } = createController()

		await expect(controller.markCurrentUserEntryGuideAutoShown('unknown')).rejects.toBeInstanceOf(
			BadRequestException
		)
		expect(userOrganizationService.markCurrentUserEntryGuideAutoShown).not.toHaveBeenCalled()
	})

	it('creates membership through addUserToOrganization so downstream listeners can react', async () => {
		const { controller, userOrganizationService, userService } = createController()
		userService.findOne.mockResolvedValue({
			id: 'user-1',
			tenantId: 'tenant-1'
		})
		userOrganizationService.addUserToOrganization.mockResolvedValue({
			id: 'membership-1',
			userId: 'user-1',
			organizationId: 'org-1',
			isActive: true,
			isDefault: true
		})

		const result = await controller.create({
			userId: 'user-1',
			organizationId: 'org-1',
			isActive: true
		})

		expect(userService.findOne).toHaveBeenCalledWith('user-1', { relations: ['role'] })
		expect(userOrganizationService.addUserToOrganization).toHaveBeenCalledWith(
			{
				id: 'user-1',
				tenantId: 'tenant-1'
			},
			'org-1'
		)
		expect(result).toEqual({
			id: 'membership-1',
			userId: 'user-1',
			organizationId: 'org-1',
			isActive: true,
			isDefault: true
		})
	})

	it('rejects direct super admin membership creation when the service skips it', async () => {
		const { controller, userOrganizationService, userService } = createController()
		userService.findOne.mockResolvedValue({
			id: 'super-admin-1',
			tenantId: 'tenant-1',
			role: {
				name: 'SUPER_ADMIN'
			}
		})
		userOrganizationService.addUserToOrganization.mockResolvedValue([])

		await expect(
			controller.create({
				userId: 'super-admin-1',
				organizationId: 'org-1'
			})
		).rejects.toThrow('Super admin users are not organization members.')

		expect(userOrganizationService.update).not.toHaveBeenCalled()
	})

	it('filters super admin users out of membership list responses', async () => {
		const { controller, userOrganizationService } = createController()
		userOrganizationService.findAll.mockResolvedValue({
			items: [],
			total: 0
		})

		const result = await controller.findAll({
			relations: ['user', 'user.role'],
			findInput: {
				organizationId: 'org-1'
			}
		})

		expect(result).toEqual({
			items: [],
			total: 0
		})
		expect(userOrganizationService.findAll).toHaveBeenCalledWith({
			where: expect.objectContaining({
				organizationId: 'org-1',
				user: {
					role: {
						name: expect.any(Object)
					}
				}
			}),
			relations: ['user', 'user.role']
		})
	})

	it('rejects direct updates to historical super admin memberships', async () => {
		const { controller, userOrganizationService } = createController()
		userOrganizationService.findOne.mockResolvedValue({
			id: 'membership-1',
			organizationId: 'org-1',
			user: {
				role: {
					name: 'SUPER_ADMIN'
				}
			}
		})

		await expect(controller.update('membership-1', { isActive: false })).rejects.toThrow(
			'Super admin users are not organization members.'
		)

		expect(userOrganizationService.update).not.toHaveBeenCalled()
	})

	it('rejects direct deletes of historical super admin memberships', async () => {
		const { commandBus, controller, userOrganizationService } = createController()
		userOrganizationService.findOne.mockResolvedValue({
			id: 'membership-1',
			organizationId: 'org-1',
			user: {
				role: {
					name: 'SUPER_ADMIN'
				}
			}
		})

		await expect(
			controller.delete('membership-1', { user: { id: 'actor-1' } }, LanguagesEnum.English)
		).rejects.toThrow('Super admin users are not organization members.')

		expect(commandBus.execute).not.toHaveBeenCalled()
	})

	it('persists explicit membership flags after resolving the requested membership', async () => {
		const { controller, userOrganizationService, userService } = createController()
		userService.findOne.mockResolvedValue({
			id: 'user-1',
			tenantId: 'tenant-1'
		})
		userOrganizationService.addUserToOrganization.mockResolvedValue([
			{
				id: 'membership-0',
				userId: 'user-1',
				organizationId: 'org-0',
				isActive: true,
				isDefault: true
			},
			{
				id: 'membership-1',
				userId: 'user-1',
				organizationId: 'org-1',
				isActive: true,
				isDefault: true
			}
		])
		userOrganizationService.findOne.mockResolvedValue({
			id: 'membership-1',
			userId: 'user-1',
			organizationId: 'org-1',
			isActive: false,
			isDefault: false
		})

		const result = await controller.create({
			userId: 'user-1',
			organizationId: 'org-1',
			isActive: false,
			isDefault: false
		})

		expect(userOrganizationService.update).toHaveBeenCalledWith('membership-1', {
			isActive: false,
			isDefault: false
		})
		expect(userOrganizationService.findOne).toHaveBeenCalledWith('membership-1')
		expect(result).toEqual({
			id: 'membership-1',
			userId: 'user-1',
			organizationId: 'org-1',
			isActive: false,
			isDefault: false
		})
	})

	it('rejects invalid payloads early', async () => {
		const { controller } = createController()

		await expect(
			controller.create({
				userId: 'user-1'
			} as Parameters<UserOrganizationController['create']>[0])
		).rejects.toBeInstanceOf(BadRequestException)
	})
})
