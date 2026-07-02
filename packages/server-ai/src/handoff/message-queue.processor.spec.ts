import { HandoffMessage, RequestContext } from '@xpert-ai/plugin-sdk'
import { HandoffQueueProcessor } from './message-queue.processor'

describe('HandoffQueueProcessor', () => {
	const createMessage = (): HandoffMessage => ({
		id: 'message-id',
		type: 'agent.chat.v1',
		version: 1,
		tenantId: 'tenant-id',
		sessionKey: 'session-id',
		businessKey: 'business-id',
		attempt: 1,
		maxAttempts: 1,
		enqueuedAt: Date.now(),
		traceId: 'trace-id',
		payload: {}
	})

	it('does not write dead-letter for canceled dead result', async () => {
		const dispatcher = {
			dispatch: jest.fn().mockResolvedValue({
				status: 'dead',
				reason: 'canceled:Canceled by user'
			})
		}
		const queueService = { enqueueMany: jest.fn(), enqueue: jest.fn() }
		const deadLetterService = { record: jest.fn() }
		const pendingResults = { resolve: jest.fn(), reject: jest.fn() }
		const processor = new HandoffQueueProcessor(
			dispatcher as any,
			queueService as any,
			deadLetterService as any,
			pendingResults as any
		)

		await processor.process({ data: createMessage() } as any)

		expect(deadLetterService.record).not.toHaveBeenCalled()
		expect(pendingResults.resolve).toHaveBeenCalledWith('message-id', {
			status: 'dead',
			reason: 'canceled:Canceled by user'
		})
	})

	it('maps aborted errors to canceled dead result without retry', async () => {
		const dispatcher = {
			dispatch: jest.fn().mockRejectedValue(new Error('This operation was aborted'))
		}
		const queueService = { enqueueMany: jest.fn(), enqueue: jest.fn() }
		const deadLetterService = { record: jest.fn() }
		const pendingResults = { resolve: jest.fn(), reject: jest.fn() }
		const processor = new HandoffQueueProcessor(
			dispatcher as any,
			queueService as any,
			deadLetterService as any,
			pendingResults as any
		)

		await processor.process({ data: createMessage() } as any)

		expect(queueService.enqueue).not.toHaveBeenCalled()
		expect(deadLetterService.record).not.toHaveBeenCalled()
		expect(pendingResults.resolve).toHaveBeenCalledWith('message-id', {
			status: 'dead',
			reason: 'canceled:This operation was aborted'
		})
	})

	it('runs queue result handling in the handoff message tenant scope', async () => {
		const observedContext: Array<{
			tenantId: string | null
			organizationId: string | null
			level: string
			currentTenantId: string | null
		}> = []
		const observeContext = () => {
			const scope = RequestContext.getScope()
			observedContext.push({
				tenantId: scope.tenantId,
				organizationId: scope.organizationId,
				level: scope.level,
				currentTenantId: RequestContext.currentTenantId()
			})
		}
		const dispatcher = {
			dispatch: jest.fn().mockImplementation(async () => {
				observeContext()
				return {
					status: 'retry',
					delayMs: 25,
					reason: 'temporary'
				}
			})
		}
		const queueService = {
			enqueueMany: jest.fn(),
			enqueue: jest.fn().mockImplementation(async () => {
				observeContext()
			})
		}
		const deadLetterService = { record: jest.fn() }
		const pendingResults = { resolve: jest.fn(), reject: jest.fn() }
		const processor = new HandoffQueueProcessor(
			dispatcher as any,
			queueService as any,
			deadLetterService as any,
			pendingResults as any
		)

		await processor.process({
			data: {
				...createMessage(),
				maxAttempts: 2
			}
		} as any)

		expect(queueService.enqueue).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 'message-id',
				attempt: 2
			}),
			{ delayMs: 25 }
		)
		expect(observedContext).toEqual([
			{
				tenantId: 'tenant-id',
				organizationId: null,
				level: 'tenant',
				currentTenantId: 'tenant-id'
			},
			{
				tenantId: 'tenant-id',
				organizationId: null,
				level: 'tenant',
				currentTenantId: 'tenant-id'
			}
		])
	})
})
