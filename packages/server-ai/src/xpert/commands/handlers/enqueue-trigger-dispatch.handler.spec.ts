import { STATE_VARIABLE_HUMAN } from '@metad/contracts'
import { AGENT_CHAT_DISPATCH_MESSAGE_TYPE } from '@xpert-ai/plugin-sdk'
import { XpertEnqueueTriggerDispatchCommand } from '../enqueue-trigger-dispatch.command'
import { XpertEnqueueTriggerDispatchHandler } from './enqueue-trigger-dispatch.handler'

describe('XpertEnqueueTriggerDispatchHandler', () => {
	function createHandler() {
		const xpertService = {
			findOne: jest.fn()
		}
		const userService = {
			findOne: jest.fn().mockResolvedValue({
				id: 'user-1',
				preferredLanguage: 'en_US'
			})
		}
		const handoffQueue = { enqueue: jest.fn().mockResolvedValue({ id: 'handoff-id' }) }

		const handler = new XpertEnqueueTriggerDispatchHandler(
			xpertService as any,
			userService as any,
			handoffQueue as any
		)

		return {
			handler,
			xpertService,
			handoffQueue
		}
	}

	it('enqueues AGENT_CHAT_DISPATCH_MESSAGE_TYPE', async () => {
		const { handler, xpertService, handoffQueue } = createHandler()
		xpertService.findOne.mockResolvedValue({
			id: 'xpert-1',
			tenantId: 'tenant-1',
			organizationId: 'org-1',
			createdById: 'user-1'
		})

		await handler.execute(
			new XpertEnqueueTriggerDispatchCommand(
				'xpert-1',
				'user-1',
				{
					[STATE_VARIABLE_HUMAN]: {
						input: 'hello'
					}
				} as any,
				{
					isDraft: false,
					from: 'schedule'
				}
			)
		)

		expect(handoffQueue.enqueue).toHaveBeenCalledTimes(1)
		const [message] = handoffQueue.enqueue.mock.calls[0]
		expect(message.type).toBe(AGENT_CHAT_DISPATCH_MESSAGE_TYPE)
		expect(message.payload.options.from).toBe('job')
	})

	it('throws when xpert does not exist', async () => {
		const { handler, xpertService } = createHandler()
		xpertService.findOne.mockResolvedValue(null)

		await expect(
			handler.execute(
				new XpertEnqueueTriggerDispatchCommand(
					'xpert-404',
					'user-1',
					{
						[STATE_VARIABLE_HUMAN]: {
							input: 'hello'
						}
					} as any,
					{
						isDraft: false,
						from: 'job'
					}
				)
			)
		).rejects.toThrow('Xpert "xpert-404" not found')
	})
})
