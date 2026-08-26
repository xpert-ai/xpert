import { RedisLockService } from './redis-lock.service'

function createService() {
	const redis = {
		set: jest.fn().mockResolvedValue('OK'),
		eval: jest.fn().mockResolvedValue(1)
	}
	const service = new RedisLockService()
	Reflect.set(service, 'redis', redis)

	return { redis, service }
}

describe('RedisLockService', () => {
	afterEach(() => {
		jest.useRealTimers()
	})

	it('skips the operation when the lock is already held', async () => {
		const { redis, service } = createService()
		redis.set.mockResolvedValueOnce(null)
		const operation = jest.fn()

		await expect(service.runWithLock('scheduler:test', 300, operation)).resolves.toEqual({ acquired: false })

		expect(operation).not.toHaveBeenCalled()
		expect(redis.eval).not.toHaveBeenCalled()
	})

	it('refreshes a long-running lock and releases it after the operation completes', async () => {
		jest.useFakeTimers()
		const { redis, service } = createService()
		let finishOperation: () => void = () => undefined
		const operation = jest.fn(
			() =>
				new Promise<string>((resolve) => {
					finishOperation = () => resolve('done')
				})
		)

		const resultPromise = service.runWithLock('scheduler:test', 300, operation)
		await Promise.resolve()
		await jest.advanceTimersByTimeAsync(100)

		expect(redis.set).toHaveBeenCalledWith('scheduler:test', expect.any(String), { PX: 300, NX: true })
		expect(redis.eval).toHaveBeenCalledWith(expect.stringContaining('pexpire'), {
			keys: ['scheduler:test'],
			arguments: [expect.any(String), '300']
		})

		finishOperation()
		await expect(resultPromise).resolves.toEqual({ acquired: true, value: 'done' })
		expect(redis.eval).toHaveBeenCalledWith(expect.stringContaining('del'), {
			keys: ['scheduler:test'],
			arguments: [expect.any(String)]
		})
	})

	it('releases the lock when the operation fails', async () => {
		const { redis, service } = createService()

		await expect(
			service.runWithLock('scheduler:test', 300, async () => {
				throw new Error('operation failed')
			})
		).rejects.toThrow('operation failed')

		expect(redis.eval).toHaveBeenCalledWith(expect.stringContaining('del'), {
			keys: ['scheduler:test'],
			arguments: [expect.any(String)]
		})
	})
})
