import { RedisLockService } from './redis-lock.service'

describe('RedisLockService', () => {
	let redis: {
		set: jest.Mock<Promise<string | null>, [string, string, { PX: number; NX: true }]>
		eval: jest.Mock<Promise<number>, [string, { keys: string[]; arguments: string[] }]>
	}
	let service: RedisLockService

	beforeEach(() => {
		redis = {
			set: jest.fn().mockResolvedValue('OK'),
			eval: jest.fn().mockResolvedValue(1)
		}
		service = new RedisLockService()
		Reflect.set(service, 'redis', redis)
	})

	it('uses node-redis option objects when acquiring a lock', async () => {
		const lockId = await service.acquireLock('lock-key', 1234)
		const capturedLockId = redis.set.mock.calls[0]?.[1]

		expect(lockId).toEqual(expect.any(String))
		expect(capturedLockId).toBe(lockId)
		expect(redis.set.mock.calls[0]).toEqual([
			'lock-key',
			capturedLockId,
			{
				PX: 1234,
				NX: true
			}
		])
	})

	it('uses node-redis eval options when releasing a lock', async () => {
		await expect(service.releaseLock('lock-key', 'lock-1')).resolves.toBe(true)

		expect(redis.eval).toHaveBeenCalledWith(expect.stringContaining('redis.call("get", KEYS[1])'), {
			keys: ['lock-key'],
			arguments: ['lock-1']
		})
	})

	it('skips redis eval when the release payload is empty', async () => {
		await expect(service.releaseLock('lock-key', '   ')).resolves.toBe(false)

		expect(redis.eval).not.toHaveBeenCalled()
	})

	it('uses node-redis eval options when refreshing a lock', async () => {
		await expect(service.refreshLock('lock-key', 'lock-1', 9876)).resolves.toBe(true)

		expect(redis.eval).toHaveBeenCalledWith(expect.stringContaining('redis.call("pexpire", KEYS[1], ARGV[2])'), {
			keys: ['lock-key'],
			arguments: ['lock-1', '9876']
		})
	})
})
