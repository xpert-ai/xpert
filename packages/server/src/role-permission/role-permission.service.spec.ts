import type { Repository } from 'typeorm'
import { AIPermissionsEnum } from '@xpert-ai/contracts'
import { RequestContext } from '../core/context'
import { RoleService } from '../role/role.service'
import { RolePermission } from './role-permission.entity'
import { RolePermissionService } from './role-permission.service'

describe('RolePermissionService', () => {
	afterEach(() => {
		jest.restoreAllMocks()
	})

	it('purges retired Analytics permissions during application bootstrap', async () => {
		const repository = {
			delete: jest.fn().mockResolvedValue({ affected: 18 }),
			update: jest.fn().mockResolvedValue({ affected: 3 })
		}
		const service = new RolePermissionService(
			repository as unknown as Repository<RolePermission>,
			{} as RoleService
		)

		await service.onApplicationBootstrap()

		expect(repository.delete).toHaveBeenCalledTimes(1)
		const criteria = repository.delete.mock.calls[0][0]
		expect(criteria.permission.value).toEqual(
			expect.arrayContaining(['MODELS_VIEW', 'STORIES_EDIT', 'INDICATOR_EDIT'])
		)
		expect(criteria.permission.value).not.toContain('DATA_SOURCE_VIEW')
		expect(criteria.permission.value).not.toContain('BUSINESS_AREA_VIEW')
		expect(criteria).not.toHaveProperty('tenantId')
		expect(repository.update).toHaveBeenCalledWith(
			{ permission: 'MEMBERSHIP_PURCHASE' },
			{ permission: AIPermissionsEnum.MEMBERSHIP_USE }
		)
	})

	it('purges retired Analytics permissions when synchronizing defaults', async () => {
		jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
		const repository = {
			delete: jest.fn().mockResolvedValue({ affected: 18 })
		}
		const roleService = {
			findAll: jest.fn().mockResolvedValue({ items: [], total: 0 })
		}
		const service = new RolePermissionService(
			repository as unknown as Repository<RolePermission>,
			roleService as unknown as RoleService
		)

		await service.syncDefaultRolePermissions()

		expect(repository.delete).toHaveBeenCalledTimes(1)
		const criteria = repository.delete.mock.calls[0][0]
		expect(criteria.tenantId.value).toEqual(['tenant-1'])
		expect(criteria.permission.value).toEqual(
			expect.arrayContaining([
				'MODELS_VIEW',
				'STORIES_EDIT',
				'BUSINESS_AREA_EDIT',
				'INDICATOR_MARTKET_VIEW',
				'DATA_FACTORY_EDIT',
				'PERMISSION_APPROVAL_EDIT'
			])
		)
		expect(criteria.permission.value).not.toContain('DATA_SOURCE_VIEW')
		expect(criteria.permission.value).not.toContain('DATA_SOURCE_EDIT')
		expect(criteria.permission.value).not.toContain('BUSINESS_AREA_VIEW')
	})
})
