import { TenantSettingsCache } from './tenant-settings-cache'

function deferred<T>() {
	let resolve!: (value: T) => void
	let reject!: (error: Error) => void
	const promise = new Promise<T>((yes, no) => {
		resolve = yes
		reject = no
	})
	return { promise, resolve, reject }
}

describe('tenant settings cache failure isolation', () => {
	beforeEach(() => jest.useFakeTimers())
	afterEach(() => jest.useRealTimers())

	it('bounds a stalled call, stops queuing work, and resumes after its late completion', async () => {
		const cache = new TenantSettingsCache()
		const pending = deferred<string>()
		const call = cache.run(() => pending.promise)
		await jest.advanceTimersByTimeAsync(250)
		expect(await call).toBeUndefined()
		const operation = jest.fn(async () => 'fresh')
		for (let i = 0; i < 100; i++) expect(await cache.run(operation)).toBeUndefined()
		expect(operation).not.toHaveBeenCalled()
		pending.resolve('late')
		await jest.advanceTimersByTimeAsync(0)
		expect(await cache.run(operation)).toBe('fresh')
		expect(jest.getTimerCount()).toBe(0)
	})

	it('handles a rejection after timeout without reopening the circuit prematurely', async () => {
		const cache = new TenantSettingsCache()
		const pending = deferred<string>()
		const call = cache.run(() => pending.promise)
		await jest.advanceTimersByTimeAsync(250)
		await call
		pending.reject(new Error('offline'))
		await jest.advanceTimersByTimeAsync(0)
		const operation = jest.fn(async () => 'recovered')
		expect(await cache.run(operation)).toBeUndefined()
		await jest.advanceTimersByTimeAsync(5000)
		expect(await cache.run(operation)).toBe('recovered')
	})

	it('backs off after immediate failures and catches synchronous store exceptions', async () => {
		const cache = new TenantSettingsCache()
		expect(
			await cache.run(() => {
				throw new Error('offline')
			})
		).toBeUndefined()
		const operation = jest.fn(async () => 'ok')
		expect(await cache.run(operation)).toBeUndefined()
		expect(operation).not.toHaveBeenCalled()
		await jest.advanceTimersByTimeAsync(5000)
		expect(await cache.run(operation)).toBe('ok')
	})

	it('bounds concurrent underlying operations before any timer has expired', async () => {
		const cache = new TenantSettingsCache()
		const pending = deferred<string>()
		const operation = jest.fn(() => pending.promise)
		const calls = Array.from({ length: 100 }, () => cache.run(operation))
		await jest.advanceTimersByTimeAsync(250)
		expect(operation).toHaveBeenCalledTimes(32)
		expect(await Promise.all(calls)).toEqual(Array(100).fill(undefined))
		pending.resolve('done')
		await jest.advanceTimersByTimeAsync(0)
		expect(await cache.run(async () => 'ok')).toBe('ok')
	})
})
