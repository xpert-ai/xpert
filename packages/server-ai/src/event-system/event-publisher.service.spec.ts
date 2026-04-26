import { XPERT_EVENT_TYPES } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { XpertEventPublisher } from './event-publisher.service'

describe('XpertEventPublisher', () => {
	afterEach(() => {
		jest.restoreAllMocks()
	})

	it('fills request context and appends to tenant stream', async () => {
		jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
		jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
		jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
		const streamService = {
			appendEvent: jest.fn(async (_tenantId, event) => ({
				...event,
				streamId: '1-0'
			}))
		}
		const publisher = new XpertEventPublisher(streamService as unknown as ConstructorParameters<typeof XpertEventPublisher>[0])

		const record = await publisher.publish({
			type: XPERT_EVENT_TYPES.ChatEvent,
			scope: {
				projectId: 'project-1'
			},
			source: {
				type: 'chat',
				id: 'conversation-1'
			},
			payload: {
				ok: true
			}
		})

		expect(streamService.appendEvent).toHaveBeenCalledWith(
			'tenant-1',
			expect.objectContaining({
				type: XPERT_EVENT_TYPES.ChatEvent,
				version: 1,
				scope: {
					projectId: 'project-1'
				},
				meta: {
					tenantId: 'tenant-1',
					organizationId: 'org-1',
					userId: 'user-1'
				}
			})
		)
		expect(record?.streamId).toBe('1-0')
	})

	it('uses explicit tenant metadata outside request context', async () => {
		jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('')
		const streamService = {
			appendEvent: jest.fn(async (_tenantId, event) => ({
				...event,
				streamId: '1-0'
			}))
		}
		const publisher = new XpertEventPublisher(streamService as unknown as ConstructorParameters<typeof XpertEventPublisher>[0])

		await publisher.publish({
			type: XPERT_EVENT_TYPES.HandoffEnqueued,
			source: {
				type: 'handoff',
				id: 'message-1'
			},
			payload: {},
			meta: {
				tenantId: 'tenant-from-message'
			}
		})

		expect(streamService.appendEvent).toHaveBeenCalledWith('tenant-from-message', expect.any(Object))
	})
})
