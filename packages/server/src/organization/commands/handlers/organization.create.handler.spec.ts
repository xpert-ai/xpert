jest.mock('../../../core/context/request-context', () => ({
	RequestContext: {
		currentUserId: jest.fn()
	}
}))

import type { EventEmitter2 } from '@nestjs/event-emitter'
import type { CommandBus } from '@nestjs/cqrs'
import type { IOrganization, IOrganizationCreateInput } from '@xpert-ai/contracts'
import { RequestContext } from '../../../core/context/request-context'
import { EVENT_ORGANIZATION_CREATED } from '../../events'
import { OrganizationService } from '../../organization.service'
import { OrganizationCreateCommand } from '../organization.create.command'
import { OrganizationCreateHandler } from './organization.create.handler'

describe('OrganizationCreateHandler', () => {
	function createHandler() {
		const commandBus = {
			execute: jest.fn()
		}
		const organizationService = {
			create: jest.fn(),
			findOne: jest.fn()
		}
		const eventEmitter = {
			emit: jest.fn()
		}
		const handler = new OrganizationCreateHandler(
			commandBus as unknown as CommandBus,
			organizationService as unknown as OrganizationService,
			eventEmitter as unknown as EventEmitter2
		)

		return {
			eventEmitter,
			handler,
			organizationService
		}
	}

	it('creates organizations without adding tenant super admins as members', async () => {
		const { eventEmitter, handler, organizationService } = createHandler()
		const createdOrganization = {
			id: 'org-1',
			tenantId: 'tenant-1',
			name: 'Organization 1'
		} as IOrganization
		jest.mocked(RequestContext.currentUserId).mockReturnValue(null)
		organizationService.create.mockResolvedValue(createdOrganization)
		organizationService.findOne.mockResolvedValue(createdOrganization)

		const result = await handler.execute(
			new OrganizationCreateCommand({
				name: 'Organization 1',
				tenantId: 'tenant-1'
			} as unknown as IOrganizationCreateInput)
		)

		expect(result).toBe(createdOrganization)
		expect(organizationService.create).toHaveBeenCalledTimes(2)
		expect(organizationService.findOne).toHaveBeenCalledWith('org-1')
		expect(eventEmitter.emit).toHaveBeenCalledWith(
			EVENT_ORGANIZATION_CREATED,
			expect.objectContaining({
				tenantId: 'tenant-1',
				organizationId: 'org-1',
				ownerUserId: null
			})
		)
	})
})
