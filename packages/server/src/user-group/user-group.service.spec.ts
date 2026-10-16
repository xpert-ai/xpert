import { UserType, UserGroupManagedByEnum } from '@xpert-ai/contracts'
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { DeepPartial, In, IsNull, Repository } from 'typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { UserGroupService } from './user-group.service'
import { UserGroup } from './user-group.entity'
import { Organization, User, UserOrganization } from '../core/entities/internal'

jest.mock('@xpert-ai/plugin-sdk', () => ({
	...jest.requireActual('@xpert-ai/plugin-sdk'),
	RequestContext: {
		currentTenantId: jest.fn(),
		currentUserId: jest.fn(),
		getOrganizationId: jest.fn(),
		requireOrganizationScope: jest.fn(),
		hasAnyPermission: jest.fn()
	}
}))
jest.mock('../core/context', () => ({
	RequestContext: jest.requireMock('@xpert-ai/plugin-sdk').RequestContext
}))
jest.mock('i18next', () => ({ t: (key: string, options?: { defaultValue: string }) => options?.defaultValue ?? key }))

const tenantId = 'tenant-a'
const organizationId = 'org-a'
const activeWhere = {
	tenantId,
	deletedAt: IsNull(),
	type: UserType.USER,
	organizations: { tenantId, organizationId, isActive: true }
}

describe('UserGroupService membership boundaries', () => {
	const groupRepository = {
		findOne: jest.fn(),
		save: jest.fn(),
		create: jest.fn()
	}
	const organizationRepository = { findOne: jest.fn() }
	const membershipRepository = { findOne: jest.fn() }
	const userRepository = { find: jest.fn() }
	let service: UserGroupService

	beforeEach(() => {
		jest.resetAllMocks()
		jest.mocked(RequestContext.currentTenantId).mockReturnValue(tenantId)
		jest.mocked(RequestContext.currentUserId).mockReturnValue('actor')
		jest.mocked(RequestContext.getOrganizationId).mockReturnValue(organizationId)
		jest.mocked(RequestContext.requireOrganizationScope).mockReturnValue(organizationId)
		jest.mocked(RequestContext.hasAnyPermission).mockReturnValue(true)
		organizationRepository.findOne.mockResolvedValue({ id: organizationId, tenantId })
		groupRepository.findOne.mockResolvedValue({ id: 'group-a', tenantId, organizationId, name: 'Existing' })
		groupRepository.create.mockImplementation((entity: DeepPartial<UserGroup>) => entity)
		groupRepository.save.mockImplementation(async (entity: DeepPartial<UserGroup>) => entity)
		userRepository.find.mockResolvedValue([{ id: 'active-user' }])
		service = new UserGroupService(
			groupRepository as unknown as Repository<UserGroup>,
			organizationRepository as unknown as Repository<Organization>,
			membershipRepository as unknown as Repository<UserOrganization>,
			userRepository as unknown as Repository<User>
		)
	})

	it('limits candidates to active memberships in the exact tenant and organization, excluding deleted users', async () => {
		expect(await service.findMemberCandidates(organizationId)).toEqual([{ id: 'active-user' }])
		expect(userRepository.find).toHaveBeenCalledWith(expect.objectContaining({ where: activeWhere }))
		expect(userRepository.find.mock.calls[0][0].select).not.toContain('hash')
	})

	it('does not let an administrator query a different organization from the current scope', async () => {
		await expect(service.findMemberCandidates('org-b')).rejects.toBeInstanceOf(ForbiddenException)
		expect(userRepository.find).not.toHaveBeenCalled()
	})

	it('fails closed without organization context instead of listing tenant users', async () => {
		jest.mocked(RequestContext.requireOrganizationScope).mockImplementation(() => {
			throw new BadRequestException()
		})
		await expect(service.findMemberCandidates()).rejects.toBeInstanceOf(BadRequestException)
		expect(userRepository.find).not.toHaveBeenCalled()
	})

	const writes = [
		[
			'create',
			(service: UserGroupService, ids: string[]) =>
				service.create({ name: 'New', members: ids.map((id) => ({ id })) })
		],
		[
			'update',
			(service: UserGroupService, ids: string[]) =>
				service.update('group-a', { name: 'Changed', members: ids.map((id) => ({ id })) })
		],
		['updateMembers', (service: UserGroupService, ids: string[]) => service.updateMembers('group-a', ids)],
		[
			'save',
			(service: UserGroupService, ids: string[]) =>
				service.save({ id: 'group-a', members: ids.map((id) => ({ id })) })
		]
	] as const

	it.each(writes)('%s rejects invalid membership before persisting any change', async (_name, write) => {
		await expect(write(service, ['active-user', 'other-org-user'])).rejects.toBeInstanceOf(BadRequestException)
		expect(userRepository.find).toHaveBeenCalledWith({
			select: ['id'],
			where: { ...activeWhere, id: In(['active-user', 'other-org-user']) }
		})
		expect(groupRepository.save).not.toHaveBeenCalled()
	})

	it.each(writes)(
		'%s accepts valid members, deduplicates IDs, and permits clearing members',
		async (_name, write) => {
			await write(service, ['active-user', 'active-user'])
			expect(groupRepository.save).toHaveBeenLastCalledWith(
				expect.objectContaining({ members: [{ id: 'active-user' }] })
			)
			await write(service, [])
			expect(groupRepository.save).toHaveBeenLastCalledWith(expect.objectContaining({ members: [] }))
		}
	)

	it.each(['inactive-user', 'deleted-user', 'other-tenant-user', 'missing-user'])(
		'rejects %s when the active membership query no longer returns it',
		async (id) => {
			userRepository.find.mockResolvedValue([])
			await expect(service.updateMembers('group-a', [id])).rejects.toBeInstanceOf(BadRequestException)
			expect(groupRepository.save).not.toHaveBeenCalled()
		}
	)

	it('cannot update or move a group outside the current organization', async () => {
		groupRepository.findOne.mockResolvedValue(null)
		await expect(service.update('group-b', { organizationId, name: 'Changed' })).rejects.toBeInstanceOf(
			NotFoundException
		)
		expect(groupRepository.findOne).toHaveBeenCalledWith({ where: { id: 'group-b', tenantId, organizationId } })
		expect(groupRepository.save).not.toHaveBeenCalled()
	})

	it('ignores forged scope, identity and managed metadata while saving validated members', async () => {
		await service.create({
			id: 'group-b',
			tenantId: 'tenant-b',
			organizationId: 'org-b',
			name: 'New',
			members: [{ id: 'active-user' }]
		})
		expect(groupRepository.save).toHaveBeenLastCalledWith(expect.objectContaining({ tenantId, organizationId }))
		expect(groupRepository.save.mock.calls[0][0].id).toBeUndefined()
		await service.update('group-a', {
			id: 'group-b',
			tenantId: 'tenant-b',
			organizationId: 'org-b',
			name: 'Updated'
		})
		expect(groupRepository.save).toHaveBeenLastCalledWith(
			expect.objectContaining({ id: 'group-a', tenantId, organizationId })
		)
	})

	it('rejects a group whose organization differs from an explicit member update target', async () => {
		groupRepository.findOne.mockResolvedValue({ id: 'group-b', tenantId, organizationId: 'org-b' })
		await expect(service.updateMembers('group-b', ['active-user'], organizationId)).rejects.toBeInstanceOf(
			ForbiddenException
		)
		expect(groupRepository.save).not.toHaveBeenCalled()
	})
	it.each(['update', 'updateMembers', 'delete'] as const)(
		'prevents organization group administrators from changing internal Assistant grants via %s',
		async (method) => {
			groupRepository.findOne.mockResolvedValue({
				id: 'managed',
				tenantId,
				organizationId,
				managedBy: UserGroupManagedByEnum.XPERT_SHARING
			})
			const action =
				method === 'update'
					? service.update('managed', { name: 'Changed' })
					: method === 'updateMembers'
						? service.updateMembers('managed', ['active-user'])
						: service.delete('managed')
			await expect(action).rejects.toBeInstanceOf(ForbiddenException)
			expect(groupRepository.save).not.toHaveBeenCalled()
		}
	)
})
