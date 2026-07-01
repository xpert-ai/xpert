import { ManagedQueueService } from './managed-queue.service'

describe('ManagedQueueService', () => {
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
			timestamp: 1,
			processedOn: 2,
			finishedOn: 3,
			getState: jest.fn(async () => 'delayed'),
			remove: jest.fn(async () => undefined)
		}
		const queue = {
			client: Promise.resolve(redis),
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
				state: 'delayed'
			})
		)
		await expect(service.getRedis()).resolves.toBe(redis)
	})
})
