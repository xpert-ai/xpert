import { HandoffMessage, RequestContext } from '@xpert-ai/plugin-sdk'
import { buildCanceledReason } from './cancel-reason'
import { MessageDispatcherService } from './message-dispatcher.service'

describe('MessageDispatcherService', () => {
	afterEach(() => {
		jest.useRealTimers()
	})

	const createMessage = (overrides?: Partial<HandoffMessage>): HandoffMessage => ({
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
		payload: {},
		...overrides
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

	it('aborts processing when policyTimeoutMs is exceeded', async () => {
		jest.useFakeTimers()
		const pendingResults = { publish: jest.fn() }
		const process = jest.fn().mockImplementation(
			(_message, ctx) =>
				new Promise((resolve) => {
					ctx.abortSignal.addEventListener(
						'abort',
						() => {
							resolve({ status: 'ok' })
						},
						{ once: true }
					)
				})
		)
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

		const resultPromise = service.dispatch(
			createMessage({
				headers: {
					policyTimeoutMs: '25'
				}
			})
		)
		await jest.advanceTimersByTimeAsync(25)

		await expect(resultPromise).resolves.toEqual({
			status: 'dead',
			reason: buildCanceledReason('Handoff total timeout after 25ms')
		})
		expect(handoffCancelService.unregister).toHaveBeenCalledWith('message-id')
	})

	it('aborts processing when policyIdleTimeoutMs is exceeded without heartbeat', async () => {
		jest.useFakeTimers()
		const pendingResults = { publish: jest.fn() }
		const process = jest.fn().mockImplementation(
			(_message, ctx) =>
				new Promise((resolve) => {
					ctx.abortSignal.addEventListener(
						'abort',
						() => {
							resolve({ status: 'ok' })
						},
						{ once: true }
					)
				})
		)
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

		const resultPromise = service.dispatch(
			createMessage({
				headers: {
					policyIdleTimeoutMs: '25'
				}
			})
		)
		await jest.advanceTimersByTimeAsync(25)

		await expect(resultPromise).resolves.toEqual({
			status: 'dead',
			reason: buildCanceledReason('Handoff idle timeout after 25ms')
		})
		expect(handoffCancelService.unregister).toHaveBeenCalledWith('message-id')
	})

	it('resets idle timeout when processors send heartbeat', async () => {
		jest.useFakeTimers()
		const pendingResults = { publish: jest.fn() }
		const process = jest.fn().mockImplementation(
			(_message, ctx) =>
				new Promise((resolve) => {
					setTimeout(() => {
						ctx.heartbeat?.('progress')
					}, 20)
					setTimeout(() => {
						resolve({ status: 'ok' })
					}, 40)
					ctx.abortSignal.addEventListener(
						'abort',
						() => {
							resolve({ status: 'dead', reason: 'aborted' })
						},
						{ once: true }
					)
				})
		)
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

		const resultPromise = service.dispatch(
			createMessage({
				headers: {
					policyIdleTimeoutMs: '30'
				}
			})
		)
		await jest.advanceTimersByTimeAsync(40)

		await expect(resultPromise).resolves.toEqual({ status: 'ok' })
		expect(handoffCancelService.unregister).toHaveBeenCalledWith('message-id')
	})

	it('keeps manual cancel reason ahead of timeout reason', async () => {
		jest.useFakeTimers()
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

		const result = await service.dispatch(
			createMessage({
				headers: {
					policyTimeoutMs: '25',
					policyIdleTimeoutMs: '25'
				}
			})
		)

		expect(result).toEqual({
			status: 'dead',
			reason: cancelReason
		})
		expect(handoffCancelService.unregister).toHaveBeenCalledWith('message-id')
	})
})
