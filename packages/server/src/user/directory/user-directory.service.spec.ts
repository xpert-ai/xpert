jest.mock('../user.entity', () => ({ User: class User {} }))

import { ForbiddenException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { PermissionsEnum, UserType } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { Brackets, DataSource, SelectQueryBuilder } from 'typeorm'
import { User } from '../user.entity'
import { userDirectoryQuerySchema } from './user-directory.schema'
import { UserDirectoryService } from './user-directory.service'

describe('UserDirectoryService', () => {
	const query = {
		withDeleted: jest.fn().mockReturnThis(),
		leftJoin: jest.fn().mockReturnThis(),
		select: jest.fn().mockReturnThis(),
		where: jest.fn().mockReturnThis(),
		andWhere: jest.fn().mockReturnThis(),
		orderBy: jest.fn().mockReturnThis(),
		addOrderBy: jest.fn().mockReturnThis(),
		take: jest.fn().mockReturnThis(),
		skip: jest.fn().mockReturnThis(),
		getManyAndCount: jest.fn()
	}
	const repository = { createQueryBuilder: jest.fn(() => query) }
	let service: UserDirectoryService

	beforeEach(async () => {
		jest.clearAllMocks()
		jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
		jest.spyOn(RequestContext, 'isTenantScope').mockReturnValue(true)
		jest.spyOn(RequestContext, 'hasAnyPermission').mockReturnValue(true)
		jest.spyOn(RequestContext, 'requireOrganizationScope').mockReturnValue('org')
		query.getManyAndCount.mockResolvedValue([[], 45])
		const module = await Test.createTestingModule({
			providers: [UserDirectoryService, { provide: getRepositoryToken(User), useValue: repository }]
		}).compile()
		service = module.get(UserDirectoryService)
	})
	afterEach(() => jest.restoreAllMocks())

	it('uses a bounded stable database page, returns the full count and selects only directory fields', async () => {
		const result = await service.list(userDirectoryQuerySchema.parse({ take: 20, skip: 20 }))
		expect(result).toEqual({ items: [], total: 45 })
		expect(query.where).toHaveBeenCalledWith('user.tenantId = :tenantId', { tenantId: 'tenant' })
		expect(query.take).toHaveBeenCalledWith(20)
		expect(query.skip).toHaveBeenCalledWith(20)
		expect(query.addOrderBy).toHaveBeenCalledWith('user.id', 'ASC')
		expect(query.select.mock.calls[0][0]).not.toEqual(expect.arrayContaining(['user.hash', 'user.refreshToken']))
		expect(RequestContext.hasAnyPermission).toHaveBeenCalledWith([
			PermissionsEnum.ALL_ORG_VIEW,
			PermissionsEnum.ALL_ORG_EDIT
		])
	})

	it('constrains both displayed and searchable memberships to the active organization', async () => {
		jest.mocked(RequestContext.isTenantScope).mockReturnValue(false)
		await service.list(userDirectoryQuerySchema.parse({ search: 'Research' }))
		expect(query.andWhere).toHaveBeenCalledWith('membership.organizationId = :organizationId', {
			organizationId: 'org'
		})
		expect(query.leftJoin).toHaveBeenCalledWith(
			'user.organizations',
			'membership',
			'membership.tenantId = :tenantId AND membership.organizationId = :organizationId'
		)
		expect(query.leftJoin).toHaveBeenCalledWith(
			'user.organizations',
			'filterMembership',
			'filterMembership.tenantId = :tenantId AND filterMembership.organizationId = :organizationId'
		)
		expect(RequestContext.hasAnyPermission).toHaveBeenCalledWith(
			expect.arrayContaining([PermissionsEnum.ORG_USERS_VIEW])
		)
	})

	it('rejects missing tenant context or permissions before querying', async () => {
		jest.mocked(RequestContext.currentTenantId).mockReturnValue(undefined)
		await expect(service.list(userDirectoryQuerySchema.parse({}))).rejects.toThrow(ForbiddenException)
		jest.mocked(RequestContext.currentTenantId).mockReturnValue('tenant')
		jest.mocked(RequestContext.hasAnyPermission).mockReturnValue(false)
		await expect(service.list(userDirectoryQuerySchema.parse({}))).rejects.toThrow(ForbiddenException)
		expect(repository.createQueryBuilder).not.toHaveBeenCalled()
	})

	it.each(['active', 'disabled'] as const)(
		'applies %s status, role, type and organization filters before paging',
		async (status) => {
			const organizationId = '00000000-0000-4000-8000-000000000001'
			await service.list(
				userDirectoryQuerySchema.parse({
					types: [UserType.COMMUNICATION],
					roles: ['VIEWER'],
					status,
					organizationIds: [organizationId]
				})
			)
			expect(query.andWhere).toHaveBeenCalledWith('user.type IN (:...types)', { types: [UserType.COMMUNICATION] })
			expect(query.andWhere).toHaveBeenCalledWith('role.name IN (:...roles)', { roles: ['VIEWER'] })
			expect(query.andWhere).toHaveBeenCalledWith(`user.deletedAt IS ${status === 'active' ? '' : 'NOT '}NULL`)
			expect(query.andWhere).toHaveBeenCalledWith('filterMembership.organizationId IN (:...organizationIds)', {
				organizationIds: [organizationId]
			})
		}
	)

	it('binds literal case-insensitive search instead of allowing wildcard or SQL input', async () => {
		await service.list(userDirectoryQuerySchema.parse({ search: " TEST_%' " }))
		const [brackets] = query.andWhere.mock.calls.find(([condition]) => condition instanceof Brackets)
		const nested = new SelectQueryBuilder<User>(new DataSource({ type: 'postgres' }))
		brackets.whereFactory(nested)
		expect(nested.getParameters().search).toBe("%test\\_\\%'%")
		expect(nested.expressionMap.wheres).toContainEqual({
			type: 'or',
			condition: 'LOWER(filterOrganization.name) LIKE :search'
		})
	})

	it('preserves all loaded organizations while omitting membership internals from directory rows', async () => {
		const user = Object.assign(new User(), {
			id: 'user',
			organizations: [
				{ id: 'membership-2', organization: { id: 'b', name: 'Zulu' } },
				{ id: 'membership-1', organization: { id: 'a', name: 'Alpha' } }
			]
		})
		query.getManyAndCount.mockResolvedValue([[user], 1])
		const result = await service.list(userDirectoryQuerySchema.parse({}))
		expect(result.items).toEqual([
			{
				id: 'user',
				displayOrganizations: [
					{ id: 'a', name: 'Alpha' },
					{ id: 'b', name: 'Zulu' }
				]
			}
		])
	})
})
