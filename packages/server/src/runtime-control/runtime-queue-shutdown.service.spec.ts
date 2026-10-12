import { DiscoveryModule } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import Bull from 'bull'
import { Worker } from 'bullmq'
import { WorkerHost } from '@nestjs/bullmq'
import { drainShutdownQueues, RuntimeQueueShutdownService } from './runtime-queue-shutdown.service'

class TestWorker extends WorkerHost {
	constructor(private readonly testWorker: Worker) {
		super()
	}
	get worker() {
		return this.testWorker
	}
	async process() {
		return undefined
	}
}

describe('RuntimeQueueShutdownService', () => {
	afterEach(() => jest.useRealTimers())

	it('stops waiting for a stalled job and force closes its worker', async () => {
		jest.useFakeTimers()
		const queue = {
			name: 'stalled',
			pause: () => new Promise<void>(() => {}),
			close: jest.fn().mockResolvedValue(undefined)
		}
		const closing = drainShutdownQueues([queue], 50)
		await jest.advanceTimersByTimeAsync(49)
		expect(queue.close).not.toHaveBeenCalled()
		await jest.advanceTimersByTimeAsync(1)
		await closing
		expect(queue.close).toHaveBeenCalledTimes(1)
	})

	it('keeps an idle queue writable until jobs on all other queues have drained', async () => {
		let finishJob: () => void
		const job = new Promise<void>((resolve) => {
			finishJob = resolve
		})
		let producerClosed = false
		const callbackQueue = {
			name: 'callbacks',
			pause: jest.fn().mockResolvedValue(undefined),
			close: jest.fn(async () => {
				producerClosed = true
			}),
			add: jest.fn(async () => {
				if (producerClosed) throw new Error('Connection is closed.')
			})
		}
		const activeQueue = { name: 'active', pause: () => job, close: jest.fn().mockResolvedValue(undefined) }
		const closing = drainShutdownQueues([activeQueue, callbackQueue])
		// An idle queue finishes draining well before the active job sends its callback.
		await new Promise<void>((resolve) => setImmediate(resolve))
		expect(callbackQueue.close).not.toHaveBeenCalled()
		await expect(callbackQueue.add()).resolves.toBeUndefined()
		finishJob()
		await closing
		expect(callbackQueue.close).toHaveBeenCalledTimes(1)
		expect(activeQueue.close).toHaveBeenCalledTimes(1)
	})

	it('keeps all producers open until the common drain grace period expires', async () => {
		jest.useFakeTimers()
		const stuck = {
			name: 'stuck',
			pause: () => new Promise<void>(() => {}),
			close: jest.fn().mockResolvedValue(undefined)
		}
		const idle = {
			name: 'idle',
			pause: jest.fn().mockResolvedValue(undefined),
			close: jest.fn().mockResolvedValue(undefined)
		}
		const closing = drainShutdownQueues([stuck, idle], 100)
		await jest.advanceTimersByTimeAsync(99)
		expect(idle.close).not.toHaveBeenCalled()
		expect(stuck.close).not.toHaveBeenCalled()
		await jest.advanceTimersByTimeAsync(1)
		await closing
		expect(idle.close).toHaveBeenCalledTimes(1)
		expect(stuck.close).toHaveBeenCalledTimes(1)
	})

	it('discovers both Nest queue types, drains once and uses local forced close', async () => {
		// Real queue prototypes let discovery exercise instanceof without opening Redis sockets.
		const queue: Bull.Queue = Object.create(Bull.prototype)
		Object.defineProperty(queue, 'name', { value: 'test' })
		const worker: Worker = Object.create(Worker.prototype)
		Object.defineProperty(worker, 'name', { value: 'test-mq' })
		const pauseBull = jest.spyOn(queue, 'pause').mockResolvedValue(undefined)
		const closeBull = jest.spyOn(queue, 'close').mockResolvedValue(undefined)
		const pauseWorker = jest.spyOn(worker, 'pause').mockResolvedValue(undefined)
		const closeWorker = jest.spyOn(worker, 'close').mockResolvedValue(undefined)
		const module = await Test.createTestingModule({
			imports: [DiscoveryModule],
			providers: [
				RuntimeQueueShutdownService,
				{ provide: 'queue', useValue: queue },
				{ provide: 'alias', useExisting: 'queue' },
				{ provide: TestWorker, useValue: new TestWorker(worker) }
			]
		}).compile()
		try {
			const service = module.get(RuntimeQueueShutdownService)
			await Promise.all([service.close(), service.close()])
			expect(pauseBull).toHaveBeenCalledTimes(1)
			expect(pauseBull).toHaveBeenCalledWith(true)
			expect(closeBull).toHaveBeenCalledWith(true)
			expect(pauseWorker).toHaveBeenCalledTimes(1)
			expect(closeWorker).toHaveBeenCalledWith(true)
		} finally {
			await module.close()
		}
	})
})
