import { BadRequestException } from '@nestjs/common'

jest.mock('./../core/crud', () => ({
	CrudController: class CrudController {
		constructor(_crudService: unknown) {}

		findById = jest.fn()
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
	TenantPermissionGuard: class TenantPermissionGuard {}
}))

jest.mock('./../core/interceptors', () => ({
	TransformInterceptor: class TransformInterceptor {}
}))

import { UserOrganizationController } from './user-organization.controller'

describe('UserOrganizationController', () => {
	function createController() {
		const userOrganizationService = {
			addUserToOrganization: jest.fn(),
			findAll: jest.fn(),
			findOne: jest.fn(),
			update: jest.fn()
		}
		const commandBus = {
			execute: jest.fn()
		}
		const userService = {
			findOne: jest.fn()
		}

		const controller = new UserOrganizationController(
			userOrganizationService as any,
			commandBus as any,
			userService as any
		)

		return {
			controller,
			userOrganizationService,
			userService
		}
	}

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
			} as any)
		).rejects.toBeInstanceOf(BadRequestException)
	})
})
