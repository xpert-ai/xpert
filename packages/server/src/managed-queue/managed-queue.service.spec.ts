import { ManagedQueueService } from './managed-queue.service'
import { RequestContext } from '@xpert-ai/plugin-sdk'

describe('ManagedQueueService', () => {
	afterEach(() => {
		jest.restoreAllMocks()
	})

	function createQueue() {
		const redis = { get: jest.fn() }
		const job = {
			id: 'job-1',
			data: {
				jobName: 'send',
				payload: { ok: true }
			},
			attemptsMade: 1,
			opts: { attempts: 2 },
			failedReason: 'handler unavailable',
			timestamp: 1,
			processedOn: 2,
			finishedOn: 3,
			getState: jest.fn(async () => 'delayed'),
			remove: jest.fn(async () => undefined)
		}
		const queue = {
			client: Promise.resolve(redis),
			getWorkersCount: jest.fn(async () => 1),
			add: jest.fn(async (_name, _data, opts) => ({
				id: opts?.jobId ?? 'job-1'
			})),
			getJob: jest.fn(async (jobId) => (jobId === 'job-1' ? job : null))
		}
		return { queue, job, redis }
	}

	it('wraps plugin payload in a managed queue envelope', async () => {
		const { queue } = createQueue()
		const service = new ManagedQueueService(queue as any)

		await expect(
			service.enqueue({
				pluginName: 'plugin-a',
				queueName: 'outbound',
				jobName: 'send',
				payload: { message: 'hello' },
				tenantId: 'tenant-1',
				organizationId: 'org-1',
				scopeKey: 'org-1',
				jobId: 'job-custom',
				delayMs: 100,
				attempts: 3,
				backoffMs: 1000
			})
		).resolves.toEqual({ jobId: 'job-custom' })

		expect(queue.add).toHaveBeenCalledWith(
			'send',
			expect.objectContaining({
				pluginName: 'plugin-a',
				queueName: 'outbound',
				jobName: 'send',
				payload: { message: 'hello' },
				tenantId: 'tenant-1',
				organizationId: 'org-1',
				scopeKey: 'org-1',
				enqueuedAt: expect.any(String)
			}),
			expect.objectContaining({
				jobId: 'job-custom',
				delay: 100,
				attempts: 3,
				backoff: {
					type: 'fixed',
					delay: 1000
				}
			})
		)
	})

	it('captures a non-secret API principal delegation for background permission checks', async () => {
		const { queue } = createQueue()
		const service = new ManagedQueueService(queue as never)
		jest.spyOn(RequestContext, 'currentUser').mockReturnValue({
			id: 'business-user-1',
			tenantId: 'tenant-1'
		} as never)
		jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
		jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue({
			id: 'business-user-1',
			tenantId: 'tenant-1',
			principalType: 'api_key',
			ownerUserId: 'owner-user-1',
			apiKeyUserId: 'assistant-user-1',
			requestedUserId: 'business-user-1',
			requestedOrganizationId: 'org-1',
			apiKey: {
				token: 'must-not-enter-redis',
				type: 'assistant',
				entityId: 'xpert-1',
				tenantId: 'tenant-1',
				organizationId: 'org-1',
				userId: 'assistant-user-1'
			}
		} as never)

		await service.enqueue({
			pluginName: 'plugin-cut',
			queueName: 'analysis',
			jobName: 'transcribe',
			payload: { mediaAssetId: 'asset-1' },
			tenantId: 'tenant-1',
			organizationId: 'org-1'
		})

		const envelope = queue.add.mock.calls[0]?.[1]
		expect(envelope).toMatchObject({
			actor: {
				userId: 'business-user-1',
				tenantId: 'tenant-1',
				organizationId: 'org-1',
				type: 'delegated_user'
			},
			delegation: {
				tenantId: 'tenant-1',
				organizationId: 'org-1',
				ownerUserId: 'owner-user-1',
				requestedUserId: 'business-user-1',
				apiKey: {
					type: 'assistant',
					entityId: 'xpert-1',
					tenantId: 'tenant-1',
					organizationId: 'org-1',
					userId: 'assistant-user-1'
				}
			}
		})
		expect(JSON.stringify(envelope)).not.toContain('must-not-enter-redis')
		expect(envelope?.delegation?.apiKey).not.toHaveProperty('token')
	})

	it('captures a logged-in user as the actor without inventing an xpert principal', async () => {
		const { queue } = createQueue()
		const service = new ManagedQueueService(queue as never)
		jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ id: 'user-1', tenantId: 'tenant-1' } as never)
		jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(null)
		jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')

		await service.enqueue({
			pluginName: 'plugin-cut',
			queueName: 'analysis',
			jobName: 'transcribe',
			payload: {},
			tenantId: 'tenant-1',
			organizationId: 'org-1',
			userId: 'user-1'
		})

		const envelope = queue.add.mock.calls[0]?.[1]
		expect(envelope).toMatchObject({
			userId: 'user-1',
			actor: {
				userId: 'user-1',
				tenantId: 'tenant-1',
				organizationId: 'org-1',
				type: 'user'
			}
		})
		expect(envelope).not.toHaveProperty('delegation')
		expect(envelope).not.toHaveProperty('principal')
	})

	it('rejects a delegated principal that does not match the requested queue scope', async () => {
		const { queue } = createQueue()
		const service = new ManagedQueueService(queue as never)
		jest.spyOn(RequestContext, 'currentUser').mockReturnValue({
			id: 'assistant-user-1',
			tenantId: 'tenant-1'
		} as never)
		jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
		jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue({
			id: 'assistant-user-1',
			tenantId: 'tenant-1',
			principalType: 'api_key',
			requestedOrganizationId: 'org-1',
			apiKey: {
				token: 'secret',
				type: 'assistant',
				entityId: 'xpert-1',
				tenantId: 'tenant-1',
				organizationId: 'org-1'
			}
		} as never)

		await expect(
			service.enqueue({
				pluginName: 'plugin-cut',
				queueName: 'analysis',
				jobName: 'transcribe',
				payload: {},
				tenantId: 'tenant-1',
				organizationId: 'org-2'
			})
		).rejects.toThrow('actor organization')
		expect(queue.add).not.toHaveBeenCalled()
	})

	it('rejects a plugin-supplied user that differs from the authenticated actor', async () => {
		const { queue } = createQueue()
		const service = new ManagedQueueService(queue as never)
		jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ id: 'user-1', tenantId: 'tenant-1' } as never)
		jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(null)

		await expect(
			service.enqueue({
				pluginName: 'plugin-cut',
				queueName: 'analysis',
				jobName: 'transcribe',
				payload: {},
				tenantId: 'tenant-1',
				userId: 'another-user'
			})
		).rejects.toThrow('actor user')
		expect(queue.add).not.toHaveBeenCalled()
	})

	it('routes sandbox browser jobs to the dedicated execution pool', async () => {
		const { queue: defaultQueue } = createQueue()
		const { queue: sandboxQueue } = createQueue()
		const service = new ManagedQueueService(defaultQueue as never, sandboxQueue as never)

		await service.enqueue({
			pluginName: 'presentation-studio',
			queueName: 'presentation-studio.export',
			jobName: 'render',
			payload: { exportId: 'export-1' },
			executionPool: 'sandbox-browser'
		})

		expect(defaultQueue.add).not.toHaveBeenCalled()
		expect(sandboxQueue.add).toHaveBeenCalledWith(
			'render',
			expect.objectContaining({ executionPool: 'sandbox-browser' }),
			expect.any(Object)
		)
	})

	it('reports execution-pool worker health before plugins enqueue work', async () => {
		const { queue: defaultQueue } = createQueue()
		const { queue: sandboxQueue } = createQueue()
		const service = new ManagedQueueService(defaultQueue as never, sandboxQueue as never)

		await expect(service.getExecutionPoolHealth({ executionPool: 'sandbox-browser' })).resolves.toEqual({
			executionPool: 'sandbox-browser',
			available: true,
			workerCount: 1
		})

		sandboxQueue.getWorkersCount.mockResolvedValueOnce(0)
		await expect(service.getExecutionPoolHealth({ executionPool: 'sandbox-browser' })).resolves.toEqual({
			executionPool: 'sandbox-browser',
			available: false,
			workerCount: 0,
			warning: expect.stringContaining('No active Managed Queue worker')
		})
	})

	it('cancels delayed jobs and reports active jobs as not removable', async () => {
		const { queue, job } = createQueue()
		const service = new ManagedQueueService(queue as any)

		await expect(service.cancel({ jobId: 'job-1' })).resolves.toEqual({
			success: true,
			jobId: 'job-1',
			state: 'delayed'
		})
		expect(job.remove).toHaveBeenCalled()

		job.getState.mockResolvedValueOnce('active')
		await expect(service.cancel({ jobId: 'job-1' })).resolves.toEqual({
			success: false,
			jobId: 'job-1',
			state: 'active',
			reason: 'active'
		})

		job.getState.mockResolvedValueOnce('completed')
		await expect(service.cancel({ jobId: 'job-1' })).resolves.toEqual({
			success: false,
			jobId: 'job-1',
			state: 'completed',
			reason: 'completed'
		})
	})

	it('returns plugin payload snapshots and exposes the BullMQ Redis client', async () => {
		const { queue, redis } = createQueue()
		const service = new ManagedQueueService(queue as any)

		await expect(service.getJob({ jobId: 'job-1' })).resolves.toEqual(
			expect.objectContaining({
				id: 'job-1',
				name: 'send',
				data: { ok: true },
				attemptsMade: 1,
				state: 'delayed',
				failedReason: 'handler unavailable'
			})
		)
		await expect(service.getRedis()).resolves.toBe(redis)
	})
})
