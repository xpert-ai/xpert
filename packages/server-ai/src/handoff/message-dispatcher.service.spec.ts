import { HandoffMessage, RequestContext } from '@xpert-ai/plugin-sdk'
import { buildCanceledReason } from './cancel-reason'
import { MessageDispatcherService } from './message-dispatcher.service'

describe('MessageDispatcherService', () => {
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

	it('dispatches message and forwards local events', async () => {
		const pendingResults = { publish: jest.fn() }
		const process = jest.fn().mockImplementation(async (_message, ctx) => {
			ctx.emit?.({ type: 'progress' })
			return { status: 'ok' }
		})
		const processorRegistry = {
			get: jest.fn().mockReturnValue({ process })
		}
		const handoffCancelService = {
			register: jest.fn(),
			unregister: jest.fn(),
			getCancelReason: jest.fn()
		}
		const service = new MessageDispatcherService(
			processorRegistry as any,
			pendingResults as any,
			handoffCancelService as any
		)

		const result = await service.dispatch(createMessage())

		expect(result).toEqual({ status: 'ok' })
		expect(processorRegistry.get).toHaveBeenCalledWith('agent.chat.v1', undefined)
		expect(process).toHaveBeenCalledTimes(1)
		expect(pendingResults.publish).toHaveBeenCalledWith('message-id', { type: 'progress' })
		expect(handoffCancelService.register).toHaveBeenCalledTimes(1)
		expect(handoffCancelService.unregister).toHaveBeenCalledWith('message-id')
	})

	it('resolves tenant-scope processors from the handoff message tenant', async () => {
		const pendingResults = { publish: jest.fn() }
		const process = jest.fn().mockResolvedValue({ status: 'ok' })
		const observedContext: Array<{
			tenantId: string | null
			organizationId: string | null
			level: string
			currentTenantId: string | null
		}> = []
		const processorRegistry = {
			get: jest.fn().mockImplementation(() => {
				const scope = RequestContext.getScope()
				observedContext.push({
					tenantId: scope.tenantId,
					organizationId: scope.organizationId,
					level: scope.level,
					currentTenantId: RequestContext.currentTenantId()
				})
				return { process }
			})
		}
		const handoffCancelService = {
			register: jest.fn(),
			unregister: jest.fn(),
			getCancelReason: jest.fn()
		}
		const service = new MessageDispatcherService(
			processorRegistry as any,
			pendingResults as any,
			handoffCancelService as any
		)

		await service.dispatch(createMessage())

		expect(processorRegistry.get).toHaveBeenCalledWith('agent.chat.v1', undefined)
		expect(observedContext).toEqual([
			{
				tenantId: 'tenant-id',
				organizationId: null,
				level: 'tenant',
				currentTenantId: 'tenant-id'
			}
		])
	})

	it('maps aborted processing to canceled dead result', async () => {
		const cancelReason = buildCanceledReason('Canceled by user')
		const reasonByMessageId = new Map<string, string>()
		const pendingResults = { publish: jest.fn() }
		const process = jest.fn().mockImplementation(async (_message, ctx) => {
			if (ctx.abortSignal.aborted) {
				throw new Error('This operation was aborted')
			}
			return { status: 'ok' }
		})
		const processorRegistry = {
			get: jest.fn().mockReturnValue({ process })
		}
		const handoffCancelService = {
			register: jest.fn((messageId: string, controller: AbortController) => {
				reasonByMessageId.set(messageId, cancelReason)
				controller.abort()
			}),
			unregister: jest.fn((messageId: string) => {
				reasonByMessageId.delete(messageId)
			}),
			getCancelReason: jest.fn((messageId: string) => reasonByMessageId.get(messageId))
		}
		const service = new MessageDispatcherService(
			processorRegistry as any,
			pendingResults as any,
			handoffCancelService as any
		)

		const result = await service.dispatch(createMessage())

		expect(result).toEqual({
			status: 'dead',
			reason: cancelReason
		})
		expect(handoffCancelService.unregister).toHaveBeenCalledWith('message-id')
	})
})
