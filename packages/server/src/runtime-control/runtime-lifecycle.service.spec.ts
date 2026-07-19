import { RuntimeLifecycleService } from './runtime-lifecycle.service'

describe('RuntimeLifecycleService', () => {
	it('tracks active requests and resolves drain waiting after they finish', async () => {
		const service = new RuntimeLifecycleService()
		const release = service.trackRequest()

		expect(release).toEqual(expect.any(Function))
		expect(service.readiness()).toMatchObject({ status: 'ready', activeRequests: 1 })
		expect(service.beginDrain({ restartId: 'restart-1', requestedAt: '2026-07-19T00:00:00.000Z' })).toBe(true)
		expect(service.trackRequest()).toBeNull()

		const idle = service.waitForIdle(1000)
		release?.()

		await expect(idle).resolves.toBe(true)
		expect(service.readiness()).toMatchObject({
			status: 'draining',
			activeRequests: 0,
			restartId: 'restart-1'
		})
	})

	it('times out when an active request does not finish', async () => {
		jest.useFakeTimers()
		const service = new RuntimeLifecycleService()
		service.trackRequest()

		const idle = service.waitForIdle(50)
		await jest.advanceTimersByTimeAsync(50)

		await expect(idle).resolves.toBe(false)
		jest.useRealTimers()
	})
})
