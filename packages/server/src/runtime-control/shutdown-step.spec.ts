import { closeRedisSubscriber, pendingShutdownSteps, runShutdownStep } from './shutdown-step'

describe('shutdown resource deadlines', () => {
	const logger = { log: jest.fn(), warn: jest.fn(), debug: jest.fn() }
	afterEach(() => {
		jest.useRealTimers()
		jest.clearAllMocks()
	})

	it('reports a stalled resource and absorbs a late rejection', async () => {
		jest.useFakeTimers()
		let reject: (error: Error) => void
		const operation = new Promise<void>((_, fail) => {
			reject = fail
		})
		const result = runShutdownStep('test.stalled', () => operation, { timeoutMs: 50, logger })
		expect(pendingShutdownSteps()).toContain('test.stalled')
		await jest.advanceTimersByTimeAsync(50)
		await expect(result).resolves.toBe('timed_out')
		expect(pendingShutdownSteps()).not.toContain('test.stalled')
		reject(new Error('Redis unavailable'))
		await jest.advanceTimersByTimeAsync(0)
		expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Redis unavailable'))
		expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('"afterTimeout":true'))
		expect(logger.debug).toHaveBeenCalledWith(
			JSON.stringify({
				event: 'runtime.shutdown.step-settled-after-timeout',
				step: 'test.stalled',
				pid: process.pid,
				status: 'failed',
				durationMs: 50
			})
		)
	})

	it('distinguishes late resource completion from completion within the grace period', async () => {
		jest.useFakeTimers()
		let complete: () => void
		const operation = new Promise<void>((resolve) => {
			complete = resolve
		})
		const result = runShutdownStep('test.late', () => operation, { timeoutMs: 50, logger })
		await jest.advanceTimersByTimeAsync(50)
		await expect(result).resolves.toBe('timed_out')
		await jest.advanceTimersByTimeAsync(25)
		complete()
		await jest.advanceTimersByTimeAsync(0)
		expect(logger.debug).toHaveBeenCalledWith(
			JSON.stringify({
				event: 'runtime.shutdown.step-settled-after-timeout',
				step: 'test.late',
				pid: process.pid,
				status: 'completed',
				durationMs: 75
			})
		)
		expect(pendingShutdownSteps()).toEqual([])
	})

	it('continues after a throwing cleanup and clears its timer', async () => {
		jest.useFakeTimers()
		await expect(
			runShutdownStep(
				'test.failed',
				() => {
					throw new Error('close failed')
				},
				{ logger }
			)
		).resolves.toBe('failed')
		expect(jest.getTimerCount()).toBe(0)
		expect(pendingShutdownSteps()).toEqual([])
	})

	it('closes Pub/Sub locally without waiting for a Redis QUIT response', async () => {
		const client = {
			isOpen: true,
			disconnect: jest.fn().mockResolvedValue(undefined),
			quit: jest.fn(() => new Promise<void>(() => {}))
		}
		await closeRedisSubscriber('test.redis', client)
		expect(client.disconnect).toHaveBeenCalledTimes(1)
		expect(client.quit).not.toHaveBeenCalled()
		await closeRedisSubscriber('test.closed', { ...client, isOpen: false })
		expect(client.disconnect).toHaveBeenCalledTimes(1)
	})
})
