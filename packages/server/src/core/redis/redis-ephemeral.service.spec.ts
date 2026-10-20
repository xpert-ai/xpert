import { createClient } from 'redis'
import { randomUUID } from 'node:crypto'
import { RedisEphemeralService } from './redis-ephemeral.service'

// Optional real-Redis integration suite: no mock can prove Lua atomicity.
const integration = process.env.TEST_REDIS_URL ? describe : describe.skip
integration('RedisEphemeralService integration', () => {
	const redis = createClient({ url: process.env.TEST_REDIS_URL })
	const service = new RedisEphemeralService(redis)
	beforeAll(async () => {
		await redis.connect()
	})
	afterAll(async () => {
		await redis.quit()
	})
	it('allows exactly one redemption across concurrent clients and isolates namespaces', async () => {
		const namespace = randomUUID()
		const ticket = await service.issueTicket(namespace, 'private', 1000)
		expect(await service.consumeTicket('another', ticket)).toBeNull()
		const results = await Promise.all(Array.from({ length: 20 }, () => service.consumeTicket(namespace, ticket)))
		expect(results.filter((result) => result === 'private')).toHaveLength(1)
	})
	it('expires tickets and rejects malformed ones', async () => {
		const namespace = randomUUID()
		const ticket = await service.issueTicket(namespace, 'expired', 30)
		await new Promise((resolve) => setTimeout(resolve, 60))
		expect(await service.consumeTicket(namespace, ticket)).toBeNull()
		expect(await service.consumeTicket(namespace, 'invalid')).toBeNull()
	})
	it('prevents old owners from renewing or releasing replacement leases', async () => {
		const resource = randomUUID()
		expect(await service.acquireLease(resource, 'old', 30)).toBe(true)
		expect(await service.acquireLease(resource, 'new', 1000)).toBe(false)
		await new Promise((resolve) => setTimeout(resolve, 60))
		expect(await service.acquireLease(resource, 'new', 1000)).toBe(true)
		expect(await service.releaseLease(resource, 'old')).toBe(false)
		expect(await service.renewLease(resource, 'old', 1000)).toBe(false)
		expect(await service.leaseOwner(resource)).toBe('new')
		expect(await service.releaseLease(resource, 'new')).toBe(true)
	})
	it('transfers an owned lease atomically without exposing an unowned gap', async () => {
		const resource = randomUUID()
		await service.acquireLease(resource, 'session', 1000)
		const transfers = await Promise.all(
			['operation-a', 'operation-b'].map((owner) => service.transferLease(resource, 'session', owner, 1000))
		)
		expect(transfers.filter(Boolean)).toHaveLength(1)
		const operation = await service.leaseOwner(resource)
		expect(await service.releaseLease(resource, 'session')).toBe(false)
		expect(await service.acquireLease(resource, 'agent', 1000)).toBe(false)
		expect(await service.transferLease(resource, operation!, 'session', 30)).toBe(true)
		await new Promise((resolve) => setTimeout(resolve, 60))
		expect(await service.transferLease(resource, 'session', 'stale', 1000)).toBe(false)
		expect(await service.acquireLease(resource, 'replacement', 1000)).toBe(true)
		expect(await service.transferLease(resource, 'session', 'stale', 1000)).toBe(false)
	})
	it('does not clear another activity owner and reaps expired activities', async () => {
		const resource = randomUUID()
		await service.touchActivity(resource, 'agent', 3000)
		await service.touchActivity(resource, 'view', 40)
		await service.releaseActivity(resource, 'view')
		expect(await service.activityRemainingMs(resource)).toBeGreaterThan(1000)
		await service.releaseActivity(resource, 'agent')
		expect(await service.activityRemainingMs(resource)).toBe(0)
		await service.touchActivity(resource, 'expired', 30)
		await new Promise((resolve) => setTimeout(resolve, 60))
		expect(await service.activityRemainingMs(resource)).toBe(0)
	})
	it('rejects unbounded lease and ticket input', async () => {
		await expect(service.acquireLease('x', 'owner', 0)).rejects.toThrow()
		await expect(service.issueTicket('x', 'x'.repeat(65537))).rejects.toThrow()
		await expect(service.issueTicket('x', 'payload', 300001)).rejects.toThrow()
	})
})
