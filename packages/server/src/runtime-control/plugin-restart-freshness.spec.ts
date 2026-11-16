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
	let ttl: (key: string) => Promise<number>
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
			ttl = (key) => client.ttl(key)
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
		} else {
			const fake = new FakeRedis()
			redis = fake
			ttl = async (key) => {
				if ((await fake.get(key)) === null) return -2
				const expiresAt = fake.expiresAt.get(key)
				return expiresAt === undefined ? -1 : Math.ceil((expiresAt - Date.now()) / 1000)
			}
		}
		store = new PluginRuntimeGenerationStore(redis)
		await store.publish({ ...change(), requirements: [old] })
		await store.publish(change())
		await store.writeState({ generation: 2, status: 'completed' })
	})
	afterAll(async () => {
		await client?.quit()
	})

	it('recovers later publications when a late catch-up loses its lease after its original history expired', async () => {
		const prefix = 'xpert:system:plugin-runtime:generation:2:'
		for (const suffix of ['status', 'change', 'requirements']) await redis.expire(prefix + suffix, 0)
		expect(await store.claimCatchUp(2, 'late-restart', 60_000)).toBe(true)
		await store.publish(change())
		await store.publish(change())
		expect((await store.readPending()).map((item) => item.generation)).toEqual([3, 4])
		expect(await store.readState(2)).toMatchObject({ status: 'in_progress', restartId: 'late-restart' })
		await redis.expire('xpert:system:runtime:restart:active', 0)
		const replacement = new PluginRuntimeGenerationStore(redis)
		for (const changes of await Promise.all([store.readPending(), replacement.readPending()])) {
			expect(changes.map((item) => item.generation)).toEqual([3, 4])
			expect(changes.some((item) => item.allowDowntime)).toBe(false)
		}
		await store.writeState({ generation: 2, status: 'completed', restartId: 'late-restart' })
		expect(await store.readState(2)).toMatchObject({ status: 'failed', restartId: 'late-restart' })
		expect(await store.readChange(2)).toBeNull()
		expect(await store.readRequirements(2)).toBeUndefined()
		expect(await store.readDesired()).toMatchObject({ generation: 4, status: 'in_progress' })
	})

	it('retains pending publication evidence and starts the history TTL only at completion', async () => {
		const generation = await store.publish(change())
		const prefix = `xpert:system:plugin-runtime:generation:${generation}:`
		const keys = ['status', 'change', 'requirements'].map((suffix) => prefix + suffix)
		expect(await Promise.all(keys.map(ttl))).toEqual([-1, -1, -1])
		// A replica still running the previous build wrote expiring pending history.
		for (const key of keys) await redis.expire(key, 3600)
		await store.writeState({ generation, status: 'awaiting_restart' })
		expect(await Promise.all(keys.map(ttl))).toEqual([-1, -1, -1])
		expect(await store.readPending()).toMatchObject([{ generation }])
		await store.writeState({ generation, status: 'completed' })
		for (const seconds of await Promise.all(keys.map(ttl))) {
			expect(seconds).toBeGreaterThan(86_390)
			expect(seconds).toBeLessThanOrEqual(86_400)
		}
	})

	it('reports a missing pending publication instead of silently dropping it', async () => {
		const generation = await store.publish(change())
		await redis.expire(`xpert:system:plugin-runtime:generation:${generation}:change`, 0)
		await expect(store.readPending()).rejects.toThrow(`Plugin runtime generation ${generation} is missing`)
		expect(await store.readState(generation)).toMatchObject({ status: 'in_progress' })
	})

	it('replays a committed publication without creating another generation or losing other scopes', async () => {
		const publicationId = 'publication-1264'
		const intent = { generation: 0, source: 'plugin-change' as const, requirements: [current], publicationId }
		const generation = await store.publish(intent)
		const other = { ...current, scopeKey: 'other-org', version: '3' }
		await store.publish({ ...change([other]), source: 'plugin-change' })
		// Simulate losing the acknowledgement after Lua committed, then process replacement.
		const replacement = new PluginRuntimeGenerationStore(redis)
		expect(await replacement.publish(intent)).toBe(generation)
		expect(await replacement.readDesired()).toMatchObject({
			generation: generation + 1,
			requirements: expect.arrayContaining([current, other])
		})
		await expect(replacement.publish({ ...intent, publicationId: 'next-publication' })).resolves.toBe(
			generation + 2
		)
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
