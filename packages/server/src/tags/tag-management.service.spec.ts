jest.mock('@xpert-ai/contracts', () => jest.requireActual('../../../contracts/src'))

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { getTagTargets, TagCategoryEnum } from '@xpert-ai/contracts'
import { EntityMetadata, Repository } from 'typeorm'
import { RequestContext } from '../core/context'
import { Tag } from './tag.entity'
import { TagManagementService } from './tag-management.service'

const tag = (changes: Partial<Tag> = {}): Tag =>
	Object.assign(new Tag(), {
		id: 'tag-1',
		name: 'Finance',
		tenantId: 'tenant-1',
		organizationId: 'org-1',
		category: TagCategoryEnum.XPERT,
		isSystem: false,
		isActive: true,
		...changes
	})

function setup() {
	const query = {
		where: jest.fn().mockReturnThis(),
		andWhere: jest.fn().mockReturnThis(),
		getMany: jest.fn().mockResolvedValue([]),
		from: jest.fn().mockReturnThis(),
		withDeleted: jest.fn().mockReturnThis(),
		innerJoin: jest.fn().mockReturnThis(),
		select: jest.fn().mockReturnThis(),
		addSelect: jest.fn().mockReturnThis(),
		groupBy: jest.fn().mockReturnThis(),
		getRawMany: jest.fn().mockResolvedValue([])
	}
	const repository = {
		find: jest.fn().mockResolvedValue([tag()]),
		findOne: jest.fn().mockResolvedValue(tag()),
		create: jest.fn((value: Partial<Tag>) => tag(value)),
		save: jest.fn(async (value: Tag) => value),
		delete: jest.fn().mockResolvedValue({ affected: 1 }),
		createQueryBuilder: jest.fn(() => query),
		manager: null
	}
	const tenantRepository = { findOne: jest.fn().mockResolvedValue({ id: 'tenant-1' }) }
	const metadata: EntityMetadata[] = []
	const manager = {
		connection: { entityMetadatas: metadata, driver: { escape: (value: string) => `"${value}"` } },
		getRepository: jest.fn((entity) => (entity === Tag ? repository : tenantRepository)),
		createQueryBuilder: jest.fn(() => query),
		transaction: jest.fn(async (work) => work(manager))
	}
	repository.manager = manager
	return {
		service: new TagManagementService(repository as unknown as Repository<Tag>),
		repository,
		query,
		metadata,
		manager,
		tenantRepository
	}
}

function addXpertRelation(metadata: EntityMetadata[]) {
	metadata.push({
		target: 'Xpert',
		tableName: 'xpert',
		primaryColumns: [{ databaseName: 'id' }],
		findColumnWithPropertyName: (name: string) => ['tenantId', 'organizationId'].includes(name),
		relations: [
			{
				isManyToMany: true,
				isOwning: true,
				inverseEntityMetadata: { target: Tag },
				junctionEntityMetadata: { tablePath: 'tag_xpert' },
				joinColumns: [{ databaseName: 'xpertId' }],
				inverseJoinColumns: [{ databaseName: 'tagId' }]
			}
		]
	} as unknown as EntityMetadata)
}

describe('Tag catalog management', () => {
	beforeEach(() => {
		jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
		jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
		jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
		jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(true)
	})
	afterEach(() => jest.restoreAllMocks())

	it('lists only current-scope and shared tags and marks shared/system tags read-only', async () => {
		const { service, repository } = setup()
		repository.find.mockResolvedValue([
			tag(),
			tag({ id: 'shared', organizationId: null }),
			tag({ id: 'system', isSystem: true })
		])
		const items = await service.directory()
		expect(items.map((item) => item.editable)).toEqual([true, false, false])
		expect(repository.find.mock.calls[0][0].where).toEqual([
			{ tenantId: 'tenant-1', organizationId: 'org-1' },
			{ tenantId: 'tenant-1', organizationId: expect.objectContaining({ _type: 'isNull' }) }
		])
		expect(items[0].targets).toEqual(['xpert'])
	})

	it('allows a tenant manager to maintain shared tags only in tenant scope', async () => {
		const { service, repository } = setup()
		jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
		repository.find.mockResolvedValue([tag({ organizationId: null })])
		repository.findOne.mockResolvedValue(tag({ organizationId: null }))
		expect((await service.directory())[0].editable).toBe(true)
		const result = await service.write({ name: 'Shared', organizationId: 'injected-org', isActive: true }, 'tag-1')
		expect(result.organizationId).toBeNull()
		expect(repository.findOne).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					id: 'tag-1',
					tenantId: 'tenant-1',
					organizationId: expect.objectContaining({ _type: 'isNull' })
				}
			})
		)
	})

	it('aggregates tenant-wide usage but still limits it to the current tenant', async () => {
		const { service, repository, query, metadata } = setup()
		jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
		repository.find.mockResolvedValue([tag({ organizationId: null })])
		addXpertRelation(metadata)
		query.getRawMany.mockResolvedValue([{ tagId: 'tag-1', count: '4' }])
		expect((await service.directory())[0].usage).toEqual([{ target: 'xpert', count: 4 }])
		expect(query.andWhere).toHaveBeenCalledWith('resource.tenantId = :tenantId', { tenantId: 'tenant-1' })
		expect(query.andWhere).not.toHaveBeenCalledWith('resource.organizationId = :organizationId', expect.anything())
	})

	it('returns a read-only directory to members without tag editing permission', async () => {
		const { service } = setup()
		jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(false)
		expect((await service.directory())[0].editable).toBe(false)
		await expect(service.write({ name: 'New' })).rejects.toBeInstanceOf(ForbiddenException)
		await expect(service.write({ description: 'changed' }, 'tag-1')).rejects.toBeInstanceOf(ForbiddenException)
		await expect(service.remove('tag-1')).rejects.toBeInstanceOf(ForbiddenException)
	})

	it('does not allow requests without a tenant', async () => {
		const { service, repository } = setup()
		jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(null)
		await expect(service.directory()).rejects.toBeInstanceOf(ForbiddenException)
		expect(repository.find).not.toHaveBeenCalled()
	})

	it('keeps the route id and request scope authoritative, strips nested associations', async () => {
		const { service, repository, tenantRepository } = setup()
		await service.write(
			{
				id: 'victim',
				name: 'Renamed',
				tenantId: 'other',
				organizationId: 'other',
				isSystem: true,
				users: [{ id: 'victim' }]
			},
			'tag-1'
		)
		expect(repository.save).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'tag-1', tenantId: 'tenant-1', organizationId: 'org-1', isSystem: false })
		)
		expect(repository.save.mock.calls[0][0].users).toBeUndefined()
		expect(tenantRepository.findOne).toHaveBeenCalledWith(
			expect.objectContaining({ lock: { mode: 'pessimistic_write' } })
		)
	})

	it('does not update a shared/foreign tag through an organization scope', async () => {
		const { service, repository } = setup()
		repository.findOne.mockResolvedValue(null)
		await expect(service.write({ name: 'Changed' }, 'foreign')).rejects.toBeInstanceOf(NotFoundException)
		expect(repository.findOne).toHaveBeenCalledWith(
			expect.objectContaining({ where: { id: 'foreign', tenantId: 'tenant-1', organizationId: 'org-1' } })
		)
		expect(repository.save).not.toHaveBeenCalled()
	})

	it('rejects editing and deleting system tags', async () => {
		const { service, repository } = setup()
		repository.findOne.mockResolvedValue(tag({ isSystem: true }))
		await expect(service.write({ name: 'Changed' }, 'tag-1')).rejects.toBeInstanceOf(ForbiddenException)
		await expect(service.remove('tag-1')).rejects.toBeInstanceOf(ForbiddenException)
	})

	it.each([
		{ name: ' ' },
		{ name: 'x'.repeat(101) },
		{ targets: [] },
		{ targets: ['invented'] },
		{ isActive: 'false' },
		{ description: 'x'.repeat(501) }
	])('rejects invalid fields %j', async (input) => {
		const { service, repository } = setup()
		await expect(service.write(input)).rejects.toBeInstanceOf(BadRequestException)
		expect(repository.save).not.toHaveBeenCalled()
	})

	it('creates one shared definition for multiple targets and ignores input identity', async () => {
		const { service, repository } = setup()
		await service.write({ id: 'victim', name: '  API  ', targets: ['toolset', 'xpert', 'toolset'] })
		expect(repository.create).toHaveBeenCalledWith(
			expect.objectContaining({ name: 'API', targets: ['toolset', 'xpert'] })
		)
		expect(repository.create.mock.calls[0][0].id).toBeUndefined()
		expect(repository.save).toHaveBeenCalledWith(
			expect.objectContaining({ name: 'API', targets: ['toolset', 'xpert'], category: 'toolset' })
		)
	})

	it('preserves legacy category-based tags and localized names', async () => {
		const { service, repository } = setup()
		repository.findOne.mockResolvedValue(tag({ label: { en_US: 'Finance', zh_Hans: '财务' } }))
		const result = await service.write({ description: 'Updated' }, 'tag-1')
		expect(getTagTargets(result)).toEqual(['xpert'])
		expect(result.label).toEqual({ en_US: 'Finance', zh_Hans: '财务' })
	})

	it('rejects duplicate names within a scope', async () => {
		const { service, query, repository } = setup()
		query.getMany.mockResolvedValue([tag({ id: 'other' })])
		await expect(service.write({ name: 'finance' })).rejects.toBeInstanceOf(BadRequestException)
		expect(repository.save).not.toHaveBeenCalled()
	})

	it('derives usage from actual junctions and scopes organization counts', async () => {
		const { service, metadata, query } = setup()
		addXpertRelation(metadata)
		query.getRawMany.mockResolvedValue([{ tagId: 'tag-1', count: '4' }])
		expect((await service.directory())[0].usage).toEqual([{ target: 'xpert', count: 4 }])
		expect(query.innerJoin).toHaveBeenCalledWith('tag_xpert', 'link', 'link."xpertId" = resource."id"')
		expect(query.andWhere).toHaveBeenCalledWith('resource.organizationId = :organizationId', {
			organizationId: 'org-1'
		})
	})

	it('prevents deletion and removing an in-use target, but allows disabling without removing links', async () => {
		const { service, metadata, query, repository } = setup()
		addXpertRelation(metadata)
		query.getRawMany.mockResolvedValue([{ tagId: 'tag-1', count: '4' }])
		await expect(service.remove('tag-1')).rejects.toBeInstanceOf(BadRequestException)
		await expect(service.write({ targets: ['knowledgebase'] }, 'tag-1')).rejects.toBeInstanceOf(BadRequestException)
		expect(repository.delete).not.toHaveBeenCalled()
		const result = await service.write({ isActive: false }, 'tag-1')
		expect(result.isActive).toBe(false)
		expect(getTagTargets(result)).toEqual(['xpert'])
		expect(repository.delete).not.toHaveBeenCalled()
	})

	it('deletes unused tags with an explicit scoped condition', async () => {
		const { service, repository } = setup()
		await service.remove('tag-1')
		expect(repository.delete).toHaveBeenCalledWith({ id: 'tag-1', tenantId: 'tenant-1', organizationId: 'org-1' })
	})
})
