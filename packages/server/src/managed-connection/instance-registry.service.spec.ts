import { InstanceRegistryService } from './instance-registry.service'

class FakeRedis {
	readonly values = new Map<string, string>()
	readonly members = new Map<string, string>()

	async hSet(_key: string, field: string, value: string) {
		this.members.set(field, value)
	}

	async hGetAll() {
		return Object.fromEntries(this.members)
	}

	async eval(script: string, { keys, arguments: args }: { keys: string[]; arguments: string[] }) {
		if (script.includes('xpert-retire-instance')) {
			const member = this.members.get(args[0])
			if (!member) return 'not-found'
			if (JSON.parse(member).bootId !== args[1]) return 'boot-changed'
			if (this.values.has(keys[1])) return 'online'
			this.members.delete(args[0])
			return 'retired'
		}
		if (script.includes('xpert-write-instance')) {
			this.members.set(args[0], args[1])
			this.values.set(keys[1], args[1])
		} else if (JSON.parse(this.members.get(args[0]) ?? '{}').bootId === args[1]) {
			this.members.delete(args[0])
			this.values.delete(keys[1])
		}
		return 1
	}

	async setEx(key: string, _seconds: number, value: string) {
		this.values.set(key, value)
	}

	async get(key: string) {
		return this.values.get(key) ?? null
	}

	async del(...keys: string[]) {
		keys.forEach((key) => this.values.delete(key))
	}
}

describe('InstanceRegistryService', () => {
	const originalInstanceId = process.env.XPERT_INSTANCE_ID

	it('bounds an in-flight heartbeat and an unresponsive unregister call', async () => {
		jest.useFakeTimers()
		const redis = new FakeRedis()
		const registry = new InstanceRegistryService(redis)
		await registry.onModuleInit()
		jest.spyOn(redis, 'eval').mockImplementation(() => new Promise<never>(() => {}))
		await jest.advanceTimersByTimeAsync(15_000)
		let closed = false
		const closing = registry.onModuleDestroy().then(() => {
			closed = true
		})
		await jest.advanceTimersByTimeAsync(5_999)
		expect(closed).toBe(false)
		await jest.advanceTimersByTimeAsync(1)
		await closing
		expect(closed).toBe(true)
		expect(jest.getTimerCount()).toBe(0)
	})

	afterEach(() => {
		jest.useRealTimers()
		if (originalInstanceId === undefined) {
			delete process.env.XPERT_INSTANCE_ID
		} else {
			process.env.XPERT_INSTANCE_ID = originalInstanceId
		}
	})

	it('selects only a live matching boot with fresh readiness, retaining offline history for audit', async () => {
		jest.useFakeTimers()
		const redis = new FakeRedis()
		process.env.XPERT_INSTANCE_ID = 'api-1'
		const registry = new InstanceRegistryService(redis)
		await registry.onModuleInit()
		expect(await registry.getReadyInstances()).toEqual([])
		await registry.setReady(true, Date.now() + 5_000)
		expect(await registry.getReadyInstances()).toEqual([
			{ instanceId: registry.instanceId, bootId: registry.bootId }
		])
		await jest.advanceTimersByTimeAsync(5_001)
		expect(await registry.getReadyInstances()).toEqual([])
		expect(await registry.getRegisteredInstances()).toHaveLength(1)
		await registry.setReady(true)
		const key = `managed-connection:instance:${registry.instanceId}`
		const live = redis.values.get(key)
		if (!live) throw new Error('Missing heartbeat')
		redis.values.set(key, JSON.stringify({ ...JSON.parse(live), bootId: 'other-boot' }))
		expect(await registry.getReadyInstances()).toEqual([])
		redis.values.delete(key)
		expect(await registry.getReadyInstances()).toEqual([])
		expect(await registry.getRegisteredInstances()).toHaveLength(1)
		await registry.onModuleDestroy()
	})

	it('writes a drain after an older readiness heartbeat finishes', async () => {
		const redis = new FakeRedis()
		const registry = new InstanceRegistryService(redis)
		await registry.onModuleInit()
		const original = redis.eval.bind(redis)
		let resume: () => void = () => undefined
		jest.spyOn(redis, 'eval').mockImplementationOnce(async (...args) => {
			await new Promise<void>((resolve) => {
				resume = resolve
			})
			return original(...args)
		})
		const ready = registry.setReady(true)
		await Promise.resolve()
		const draining = registry.setReady(false)
		resume()
		await Promise.all([ready, draining])
		expect(await registry.getReadyInstances()).toEqual([])
		await registry.onModuleDestroy()
	})

	it('registers boot identity but keeps reported plugin state local', async () => {
		const redis = new FakeRedis()
		process.env.XPERT_INSTANCE_ID = 'api-1'
		const registry = new InstanceRegistryService(redis)
		await registry.onModuleInit()

		await registry.reportPluginState({
			plugins: [{ scopeKey: 'org-1', pluginName: 'openrouter', version: '0.1.0' }],
			failures: []
		})

		expect(registry.getPluginState()).toEqual({
			reportedAt: expect.any(String),
			plugins: [{ scopeKey: 'org-1', pluginName: 'openrouter', version: '0.1.0' }],
			failures: []
		})
		const heartbeat = JSON.parse(redis.values.get('managed-connection:instance:api-1') ?? '{}')
		expect(heartbeat).toMatchObject({ instanceId: 'api-1' })
		expect(heartbeat.bootId).toBe(registry.bootId)
		expect(heartbeat).not.toHaveProperty('pluginState')
		await expect(registry.getRegisteredInstances()).resolves.toEqual([
			{ instanceId: 'api-1', bootId: registry.bootId }
		])
		await registry.onModuleDestroy()
		await expect(registry.getRegisteredInstances()).resolves.toEqual([])
	})

	it('does not let a departing old boot remove its replacement registration or heartbeat', async () => {
		const redis = new FakeRedis()
		process.env.XPERT_INSTANCE_ID = 'api-1'
		const old = new InstanceRegistryService(redis)
		const replacement = new InstanceRegistryService(redis)
		await old.onModuleInit()
		await replacement.onModuleInit()
		await old.onModuleDestroy()
		await expect(replacement.getRegisteredInstances()).resolves.toEqual([
			{ instanceId: 'api-1', bootId: replacement.bootId }
		])
		await expect(replacement.isAlive('api-1')).resolves.toBe(true)
		await replacement.onModuleDestroy()
	})

	it('retires only the explicitly selected offline boot and leaves replacement and online instances intact', async () => {
		const redis = new FakeRedis()
		const registry = new InstanceRegistryService(redis)
		const member = { instanceId: 'api-old', bootId: 'boot-1', lastSeenAt: new Date().toISOString() }
		redis.members.set(member.instanceId, JSON.stringify(member))
		await expect(registry.getRegisteredInstanceDetails()).resolves.toEqual([{ ...member, online: false }])
		await expect(registry.retireInstance('api-old', 'stale-boot')).resolves.toEqual({ status: 'boot-changed' })
		redis.values.set('managed-connection:instance:api-old', JSON.stringify(member))
		await expect(registry.retireInstance('api-old', member.bootId)).resolves.toEqual({ status: 'online' })
		expect(await registry.getRegisteredInstances()).toHaveLength(1)
		redis.values.delete('managed-connection:instance:api-old')
		await expect(registry.retireInstance('api-old', member.bootId)).resolves.toEqual({ status: 'retired' })
		expect(await registry.getRegisteredInstances()).toHaveLength(0)
		await expect(registry.retireInstance('api-old', member.bootId)).resolves.toEqual({ status: 'not-found' })
	})

	it('retains registered members after heartbeat expiry until an explicit departure', async () => {
		jest.useFakeTimers()
		const redis = new FakeRedis()
		const registry = new InstanceRegistryService(redis)
		for (let i = 0; i < 7; i++) {
			redis.members.set(
				`api-${i}`,
				JSON.stringify({ instanceId: `api-${i}`, bootId: `boot-${i}`, lastSeenAt: new Date().toISOString() })
			)
		}
		expect(await registry.getRegisteredInstances()).toHaveLength(7)
		jest.setSystemTime(Date.now() + 46_000)
		expect(await registry.getRegisteredInstances()).toHaveLength(7)
	})
})
