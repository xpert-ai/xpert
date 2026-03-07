import { RedisSseStreamService } from './redis-sse.service'

describe('RedisSseStreamService', () => {
	it('stores lock owner metadata when acquiring a stream lock', async () => {
		const redis = createRedisMock()
		redis.set.mockResolvedValueOnce('OK').mockResolvedValueOnce('OK')

		const service = new RedisSseStreamService(redis as any)
		const result = await service.createSseStream({
			threadId: 'thread-1',
			runId: 'run-1',
			mode: 'join',
			owner: {
				mode: 'join',
				requestId: 'req-1',
				userId: 'user-1',
				userAgent: 'chatkit'
			}
		})

		expect(result.lockId).toBeTruthy()
		expect(redis.set).toHaveBeenNthCalledWith(1, 'ai:sse:lock:thread:thread-1:run:run-1', expect.any(String), {
			PX: 30000,
			NX: true
		})
		expect(redis.set).toHaveBeenNthCalledWith(
			2,
			'ai:sse:lockmeta:thread:thread-1:run:run-1',
			expect.stringContaining('"userAgent":"chatkit"'),
			{ PX: 30000 }
		)
	})

	it('returns current lock owner metadata when the stream is already locked', async () => {
		const redis = createRedisMock()
		redis.set.mockResolvedValueOnce(null)
		redis.get.mockResolvedValueOnce('lock-1').mockResolvedValueOnce(
			JSON.stringify({
				lockId: 'lock-1',
				connectedAt: '2026-03-07T00:00:00.000Z',
				mode: 'join',
				requestId: 'req-existing',
				userId: 'user-existing',
				userAgent: 'existing-client'
			})
		)
		redis.pTTL.mockResolvedValueOnce(12000)

		const service = new RedisSseStreamService(redis as any)
		const result = await service.createSseStream({
			threadId: 'thread-1',
			runId: 'run-1',
			mode: 'join',
			owner: {
				mode: 'join',
				requestId: 'req-new'
			}
		})

		expect(result.lockId).toBeNull()
		expect(result.lock).toEqual({
			lockId: 'lock-1',
			ttlMs: 12000,
			owner: expect.objectContaining({
				requestId: 'req-existing',
				userId: 'user-existing',
				userAgent: 'existing-client'
			})
		})
	})
})

function createRedisMock() {
	return {
		set: jest.fn(),
		get: jest.fn(),
		pTTL: jest.fn(),
		pExpire: jest.fn(),
		eval: jest.fn(),
		sendCommand: jest.fn()
	}
}
