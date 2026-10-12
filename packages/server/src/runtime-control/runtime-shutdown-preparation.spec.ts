import { DiscoveryModule } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import Bull from 'bull'
import { RuntimeLifecycleService } from './runtime-lifecycle.service'
import { RuntimeQueueShutdownService } from './runtime-queue-shutdown.service'
import { HTTP_SHUTDOWN_DRAIN_TIMEOUT_MS, prepareApiShutdown } from './runtime-shutdown-preparation'

describe('API shutdown preparation', () => {
	afterEach(() => jest.useRealTimers())

	async function fixture() {
		let closed = false
		const queue: Bull.Queue = Object.create(Bull.prototype)
		Object.defineProperty(queue, 'name', { value: 'http-jobs' })
		const pause = jest.spyOn(queue, 'pause').mockResolvedValue(undefined)
		const close = jest.spyOn(queue, 'close').mockImplementation(async () => {
			closed = true
		})
		const add = jest.spyOn(queue, 'add').mockImplementation(async () => {
			if (closed) throw new Error('Connection is closed.')
			if (pause.mock.calls.length) throw new Error('No consumer left to complete the request job')
			const job: Bull.Job = Object.create(null)
			return job
		})
		const module = await Test.createTestingModule({
			imports: [DiscoveryModule],
			providers: [RuntimeLifecycleService, RuntimeQueueShutdownService, { provide: 'queue', useValue: queue }]
		}).compile()
		return {
			module,
			pause,
			close,
			add,
			queue,
			lifecycle: module.get(RuntimeLifecycleService),
			queues: module.get(RuntimeQueueShutdownService)
		}
	}

	it.each([false, true])(
		'allows a pending HTTP request to enqueue and finish before queues close (already draining=%s)',
		async (alreadyDraining) => {
			const f = await fixture()
			try {
				const release = f.lifecycle.trackRequest()
				if (alreadyDraining)
					f.lifecycle.beginDrain({ restartId: 'plugin-restart', requestedAt: new Date().toISOString() })
				const closing = prepareApiShutdown(f.lifecycle, f.queues)
				await new Promise<void>((resolve) => setImmediate(resolve))
				expect(f.lifecycle.trackRequest()).toBeNull()
				expect(f.pause).not.toHaveBeenCalled()
				expect(f.close).not.toHaveBeenCalled()
				await expect(f.queue.add('after-database-query', {})).resolves.toBeDefined()
				release()
				await closing
				expect(f.pause).toHaveBeenCalledTimes(1)
				expect(f.close).toHaveBeenCalledTimes(1)
			} finally {
				await f.module.close()
			}
		}
	)

	it('bounds a persistent HTTP stream without closing queues before its grace period', async () => {
		jest.useFakeTimers()
		const f = await fixture()
		try {
			const release = f.lifecycle.trackRequest()
			const closing = prepareApiShutdown(f.lifecycle, f.queues)
			await jest.advanceTimersByTimeAsync(HTTP_SHUTDOWN_DRAIN_TIMEOUT_MS - 1)
			expect(f.pause).not.toHaveBeenCalled()
			await jest.advanceTimersByTimeAsync(1)
			await closing
			expect(f.close).toHaveBeenCalledTimes(1)
			release()
		} finally {
			await f.module.close()
		}
	})
})
