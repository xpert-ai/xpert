jest.mock('../core/context', () => ({
	RequestContext: {
		currentTenantId: jest.fn(),
		currentUser: jest.fn(),
		currentUserId: jest.fn()
	}
}))

import type { Cache } from 'cache-manager'
import type { EventEmitter2 } from '@nestjs/event-emitter'
import type { Repository } from 'typeorm'
import { RequestContext } from '../core/context'
import { Organization } from '../organization/organization.entity'
import { EVENT_USER_ORGANIZATION_DELETED } from '../user/events'
import { UserOrganization } from './user-organization.entity'
import { UserOrganizationService } from './user-organization.services'

describe('UserOrganizationService', () => {
	const userOrganizationRepository = {
		find: jest.fn(),
		delete: jest.fn(),
		update: jest.fn()
	}
	const organizationRepository = {
		find: jest.fn()
	}
	const eventEmitter = {
		emit: jest.fn()
	}
	const cacheManager = {
		set: jest.fn()
	}

	let service: UserOrganizationService

	beforeEach(() => {
		jest.clearAllMocks()
		jest.mocked(RequestContext.currentUserId).mockReturnValue('actor-1')
		userOrganizationRepository.delete.mockResolvedValue({ affected: 3 })
		userOrganizationRepository.update.mockResolvedValue({ affected: 1 })

		service = new UserOrganizationService(
			userOrganizationRepository as unknown as Repository<UserOrganization>,
			organizationRepository as unknown as Repository<Organization>,
			eventEmitter as unknown as EventEmitter2,
			cacheManager as unknown as Cache
		)
	})

	it('bulk removes organization memberships and preserves per-user side effects', async () => {
		userOrganizationRepository.find
			.mockResolvedValueOnce([
				{
					id: 'membership-1',
					tenantId: 'tenant-1',
					organizationId: 'org-1',
					userId: 'user-1',
					isDefault: true,
					isActive: true
				},
				{
					id: 'membership-2',
					tenantId: 'tenant-1',
					organizationId: 'org-1',
					userId: 'user-2',
					isDefault: false,
					isActive: true
				},
				{
					id: 'membership-3',
					tenantId: 'tenant-1',
					organizationId: 'org-1',
					userId: 'user-3',
					isDefault: true,
					isActive: true
				}
			])
			.mockResolvedValueOnce([
				{
					id: 'membership-4',
					tenantId: 'tenant-1',
					organizationId: 'org-2',
					userId: 'user-1',
					isDefault: false,
					isActive: false
				},
				{
					id: 'membership-5',
					tenantId: 'tenant-1',
					organizationId: 'org-3',
					userId: 'user-1',
					isDefault: false,
					isActive: true
				}
			])

		await service.deleteByOrganizationForOrganizationRemoval({
			tenantId: 'tenant-1',
			organizationId: 'org-1'
		})

		expect(userOrganizationRepository.delete).toHaveBeenCalledTimes(1)
		expect(userOrganizationRepository.delete).toHaveBeenCalledWith({
			tenantId: 'tenant-1',
			organizationId: 'org-1'
		})
		expect(userOrganizationRepository.update).toHaveBeenCalledWith(
			'membership-5',
			expect.objectContaining({
				id: 'membership-5',
				isDefault: true,
				updatedById: 'actor-1'
			})
		)
		expect(cacheManager.set).toHaveBeenCalledTimes(3)
		expect(cacheManager.set).toHaveBeenCalledWith(
			'user:me:feature-context:user-version:tenant-1:user-1',
			expect.any(String),
			86_400_000
		)
		expect(cacheManager.set).toHaveBeenCalledWith(
			'user:me:feature-context:user-version:tenant-1:user-2',
			expect.any(String),
			86_400_000
		)
		expect(cacheManager.set).toHaveBeenCalledWith(
			'user:me:feature-context:user-version:tenant-1:user-3',
			expect.any(String),
			86_400_000
		)
		expect(eventEmitter.emit).toHaveBeenCalledTimes(3)
		expect(eventEmitter.emit).toHaveBeenCalledWith(
			EVENT_USER_ORGANIZATION_DELETED,
			expect.objectContaining({
				tenantId: 'tenant-1',
				organizationId: 'org-1',
				userId: 'user-1'
			})
		)
	})
})
