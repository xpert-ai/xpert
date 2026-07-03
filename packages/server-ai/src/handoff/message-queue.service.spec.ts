import { HandoffMessage } from '@xpert-ai/plugin-sdk'
import { XPERT_HANDOFF_QUEUE_REALTIME } from './constants'
import { HandoffQueueService } from './message-queue.service'

describe('HandoffQueueService route policy headers', () => {
	const createMessage = (overrides?: Partial<HandoffMessage>): HandoffMessage => ({
		id: 'message-id',
		type: 'agent.chat_dispatch.v1',
		version: 1,
		tenantId: 'tenant-id',
		sessionKey: 'session-id',
		businessKey: 'business-id',
		attempt: 1,
		maxAttempts: 1,
		enqueuedAt: Date.now(),
		traceId: 'trace-id',
		payload: {},
		...overrides
	})

	it('writes total and idle timeout policy headers when absent', async () => {
		const queueGateway = {
			enqueue: jest.fn().mockResolvedValue(undefined)
		}
		const routeResolver = {
			resolve: jest.fn().mockReturnValue({
				queue: XPERT_HANDOFF_QUEUE_REALTIME,
				lane: 'main',
				policy: {
					lane: 'main',
					timeoutMs: 600000,
					idleTimeoutMs: 120000
				}
			})
		}
		const pendingResults = {}
		const service = new HandoffQueueService(queueGateway as any, routeResolver as any, pendingResults as any)

		await service.enqueue(createMessage())

		expect(queueGateway.enqueue).toHaveBeenCalledWith(
			XPERT_HANDOFF_QUEUE_REALTIME,
			expect.objectContaining({
				headers: expect.objectContaining({
					requestedLane: 'main',
					handoffQueue: XPERT_HANDOFF_QUEUE_REALTIME,
					policyTimeoutMs: '600000',
					policyIdleTimeoutMs: '120000'
				})
			}),
			undefined
		)
	})

	it('keeps explicit timeout policy headers from the message', async () => {
		const queueGateway = {
			enqueue: jest.fn().mockResolvedValue(undefined)
		}
		const routeResolver = {
			resolve: jest.fn().mockReturnValue({
				queue: XPERT_HANDOFF_QUEUE_REALTIME,
				lane: 'main',
				policy: {
					lane: 'main',
					timeoutMs: 600000,
					idleTimeoutMs: 120000
				}
			})
		}
		const pendingResults = {}
		const service = new HandoffQueueService(queueGateway as any, routeResolver as any, pendingResults as any)

		await service.enqueue(
			createMessage({
				headers: {
					policyTimeoutMs: '1000',
					policyIdleTimeoutMs: '2000'
				}
			})
		)

		expect(queueGateway.enqueue).toHaveBeenCalledWith(
			XPERT_HANDOFF_QUEUE_REALTIME,
			expect.objectContaining({
				headers: expect.objectContaining({
					policyTimeoutMs: '1000',
					policyIdleTimeoutMs: '2000'
				})
			}),
			undefined
		)
	})
})
