import { createClient } from 'redis'
import { PluginRuntimeGenerationStore } from './plugin-runtime-generation.store'
import type { RuntimeRestartRedisClient } from './runtime-restart.types'
import { FakeRedis, createNode } from './runtime-restart.test-fixture'
import { evaluateRuntimeRequirements } from './plugin-runtime-requirements'

const old = { scopeKey: 'org-1', pluginName: '@test/plugin', version: '0.5.5', state: 'loaded' as const }
const current = { ...old, version: '0.6.1', runtimeRevision: 'revision-2' }
const change = (requirements = [current]) => ({ generation: 0, source: 'interactive' as const, requirements })

// The optional URL must point to a disposable Redis database; this suite clears it between cases.
const redisUrl = process.env.RUNTIME_RESTART_TEST_REDIS_URL
describe.each(redisUrl ? ['fake', 'redis'] : ['fake'])('Plugin restart freshness (%s)', (backend) => {
	let store: PluginRuntimeGenerationStore
	let redis: RuntimeRestartRedisClient
	let client: ReturnType<typeof createClient>
	beforeAll(async () => {
		if (backend === 'redis') {
			client = createClient({ url: redisUrl })
			await client.connect()
		}
	})
	beforeEach(async () => {
		if (client) {
			await client.flushDb()
			redis = {
				get: (key) => client.get(key),
				set: (key, value, options) =>
					client.set(key, value, {
						...(options?.NX ? { NX: true as const } : {}),
						...(options?.PX ? { PX: options.PX } : options?.EX ? { EX: options.EX } : {})
					}),
				hSet: (key, field, value) => client.hSet(key, field, value),
				hGetAll: (key) => client.hGetAll(key),
				expire: (key, seconds) => client.expire(key, seconds),
				eval: async (script, options) => {
					const result = await client.eval(script, options)
					if (result === null) return null
					if (typeof result === 'number' || typeof result === 'string') return result
					throw new Error('Unexpected Redis result')
				}
			}
		} else redis = new FakeRedis()
		store = new PluginRuntimeGenerationStore(redis)
		await store.publish({ ...change(), requirements: [old] })
		await store.publish(change())
		await store.writeState({ generation: 2, status: 'completed' })
	})
	afterAll(async () => {
		await client?.quit()
	})

	it.each([
		{ generation: 1, requirements: [old] },
		{ generation: 1, requirements: [current] },
		{ generation: 2, requirements: [old] },
		{ generation: 2, requirements: [{ ...current, runtimeRevision: 'revision-1' }] },
		{ generation: 2, requirements: [{ ...current, state: 'absent' as const }] },
		{ generation: 2, requirements: [{ ...current, pluginName: '@test/unknown' }] }
	])('rejects stale or mismatched publication without any writes: %j', async ({ generation, requirements }) => {
		const before = await store.readDesired()
		await expect(store.publish({ ...change(), requirements }, generation)).rejects.toMatchObject({
			response: { statusCode: 409, errorCode: 'PLUGIN_RUNTIME_REQUIREMENTS_CHANGED' }
		})
		expect(await store.current()).toBe(2)
		expect(await store.readDesired()).toEqual(before)
		expect(await store.readState(3)).toBeNull()
	})

	it('publishes an explicitly approved current requirement and still enforces exact admission', async () => {
		expect(await store.publish(change(), 2)).toBe(3)
		expect(await store.readDesired()).toMatchObject({ generation: 3, requirements: [current] })
		expect(
			evaluateRuntimeRequirements([current], {
				reportedAt: new Date().toISOString(),
				plugins: [old],
				failures: []
			})
		).toMatchObject({
			status: 'failed'
		})
	})

	if (backend === 'redis')
		it('allows only one of two concurrent retries based on the same generation', async () => {
			const results = await Promise.allSettled([store.publish(change(), 2), store.publish(change(), 2)])
			expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
			expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
			expect(await store.current()).toBe(3)
		})
})

it('serves durable recovery evidence after generation history expires', async () => {
	jest.useFakeTimers()
	const redis = new FakeRedis()
	const store = new PluginRuntimeGenerationStore(redis)
	await store.publish(change())
	await store.writeState({ generation: 1, status: 'completed' })
	jest.setSystemTime(Date.now() + 25 * 60 * 60_000)
	const node = await createNode(
		redis,
		'api-1',
		'boot-1',
		{ reportedAt: new Date().toISOString(), plugins: [current], failures: [] },
		false
	)
	try {
		expect(await store.readState(1)).toBeNull()
		await expect(node.coordinator.getPluginRuntimeSnapshot()).resolves.toEqual({
			generation: 1,
			status: 'completed',
			requirements: [current]
		})
	} finally {
		await node.destroy()
		jest.useRealTimers()
	}
})
