import type { IRuntimePluginRequirement } from '@xpert-ai/contracts'
import { InstanceRegistryService, RuntimePluginState } from '../managed-connection/instance-registry.service'
import { RuntimeLifecycleService } from './runtime-lifecycle.service'
import { RuntimeProcessSignaler } from './runtime-process-signaler'
import { RuntimeRestartCoordinatorService } from './runtime-restart-coordinator.service'
import { PluginRuntimeGenerationStore } from './plugin-runtime-generation.store'
import { RuntimeRestartTargetStore } from './runtime-restart-target.store'
import type { RestartTargetState } from './runtime-restart.types'

type Listener = (message: string) => void

class FakeRedis {
	readonly members = new Map<string, { instanceId: string; bootId: string }>()
	readonly values = new Map<string, string>()
	readonly hashes = new Map<string, Map<string, string>>()
	readonly expiresAt = new Map<string, number>()
	readonly listeners = new Map<string, Set<Listener>>()
	onActiveReleased?: () => Promise<void>
	onGenerationPublished?: (generation: number) => Promise<void>

	async set(key: string, value: string, options?: { NX?: boolean; PX?: number; EX?: number }) {
		this.expireKeyIfNeeded(key)
		if (options?.NX && this.values.has(key)) return null
		this.values.set(key, value)
		if (options?.PX) {
			this.expiresAt.set(key, Date.now() + options.PX)
		} else if (options?.EX) {
			this.expiresAt.set(key, Date.now() + options.EX * 1_000)
		} else {
			this.expiresAt.delete(key)
		}
		return 'OK'
	}

	async get(key: string) {
		this.expireKeyIfNeeded(key)
		return this.values.get(key) ?? null
	}

	async hSet(key: string, field: string, value: string) {
		this.expireKeyIfNeeded(key)
		const hash = this.hashes.get(key) ?? new Map<string, string>()
		const added = hash.has(field) ? 0 : 1
		hash.set(field, value)
		this.hashes.set(key, hash)
		return added
	}

	async hGetAll(key: string) {
		this.expireKeyIfNeeded(key)
		return Object.fromEntries(this.hashes.get(key) ?? [])
	}

	async expire(key: string, seconds: number) {
		this.expireKeyIfNeeded(key)
		if (!this.values.has(key) && !this.hashes.has(key)) return false
		this.expiresAt.set(key, Date.now() + seconds * 1_000)
		return true
	}

	async eval(script: string, options: { keys: string[]; arguments: string[] }) {
		if (script.includes('xpert-write-generation-state')) {
			const [value, generation, ttl, restartId] = options.arguments
			if (restartId && (await this.get(options.keys[2])) !== restartId) return 0
			const desired = await this.hGetAll(options.keys[1])
			const current = desired.generation === generation
			if (current && desired.status === 'failed') return 0
			await this.set(options.keys[0], value, { EX: Number(ttl) })
			if (current) await this.hSet(options.keys[1], 'status', JSON.parse(value).status)
			return 1
		}
		if (script.includes('xpert-start-plugin-catch-up')) {
			const [generation, restartId, ttl] = options.arguments
			const desired = await this.hGetAll(options.keys[0])
			if (desired.generation !== generation || desired.status !== 'completed') return 0
			if ((await this.set(options.keys[1], restartId, { NX: true, PX: Number(ttl) })) !== 'OK') return 0
			await this.hSet(options.keys[0], 'status', 'in_progress')
			return 1
		}
		if (script.includes('xpert-update-restart-target')) {
			const [restartId, replicaId, previous, next] = options.arguments
			if (
				(await this.get(options.keys[1])) !== restartId ||
				this.hashes.get(options.keys[0])?.get(replicaId) !== previous
			)
				return 0
			await this.hSet(options.keys[0], replicaId, next)
			if (Number(options.arguments[4]) > 0) await this.hSet(options.keys[2], replicaId, options.arguments[4])
			return 1
		}
		if (script.includes('xpert-publish-plugin-generation')) {
			const generationKey = options.keys[0]
			const generation = Number.parseInt(this.values.get(generationKey) ?? '0', 10) + 1
			this.values.set(generationKey, `${generation}`)
			const change = JSON.parse(options.arguments[0])
			change.generation = generation
			const prefix = options.arguments[1]
			const ttlMs = Number.parseInt(options.arguments[2], 10) * 1_000
			const changeKey = `${prefix}${generation}:change`
			const statusKey = `${prefix}${generation}:status`
			this.values.set(changeKey, JSON.stringify(change))
			this.values.set(statusKey, JSON.stringify({ generation, status: 'in_progress' }))
			this.expiresAt.set(changeKey, Date.now() + ttlMs)
			this.expiresAt.set(statusKey, Date.now() + ttlMs)
			for (const item of change.requirements) {
				await this.hSet(options.keys[1], JSON.stringify([item.scopeKey, item.pluginName]), JSON.stringify(item))
			}
			await this.hSet(options.keys[1], 'generation', `${generation}`)
			await this.hSet(options.keys[1], 'status', 'in_progress')
			await this.onGenerationPublished?.(generation)
			return generation
		}

		const [key] = options.keys
		const [expected] = options.arguments
		this.expireKeyIfNeeded(key)
		if (this.values.get(key) !== expected) return options.keys.length > 1 ? -1 : 0
		if (script.includes("redis.call('pexpire'")) {
			this.expiresAt.set(key, Date.now() + Number.parseInt(options.arguments[1], 10))
			return 1
		}
		if (options.keys.length > 1) {
			const expectedGeneration = options.arguments[1]
			const nextRestartId = options.arguments[2]
			this.expireKeyIfNeeded(options.keys[1])
			if ((this.values.get(options.keys[1]) ?? '0') !== expectedGeneration) return 0
			if (nextRestartId) {
				this.values.set(key, nextRestartId)
				this.expiresAt.set(key, Date.now() + Number.parseInt(options.arguments[3], 10))
				return 1
			}
		}
		this.values.delete(key)
		this.expiresAt.delete(key)
		if (key === 'xpert:system:runtime:restart:active' && this.onActiveReleased) {
			const callback = this.onActiveReleased
			this.onActiveReleased = undefined
			await callback()
		}
		return 1
	}

	private expireKeyIfNeeded(key: string) {
		const expiresAt = this.expiresAt.get(key)
		if (expiresAt !== undefined && expiresAt <= Date.now()) {
			this.values.delete(key)
			this.hashes.delete(key)
			this.expiresAt.delete(key)
		}
	}

	duplicate() {
		const owned = new Map<string, Listener>()
		return {
			connect: async () => undefined,
			subscribe: async (channel: string, listener: Listener) => {
				const listeners = this.listeners.get(channel) ?? new Set<Listener>()
				listeners.add(listener)
				this.listeners.set(channel, listeners)
				owned.set(channel, listener)
			},
			unsubscribe: async (channel: string) => {
				const listener = owned.get(channel)
				if (listener) this.listeners.get(channel)?.delete(listener)
				owned.delete(channel)
			},
			quit: async () => {
				for (const [channel, listener] of owned) this.listeners.get(channel)?.delete(listener)
				owned.clear()
			}
		}
	}

	async publish(channel: string, message: string) {
		for (const listener of Array.from(this.listeners.get(channel) ?? [])) listener(message)
		return this.listeners.get(channel)?.size ?? 0
	}
}

type RuntimeNode = {
	replicaId: string
	bootId: string
	coordinator: RuntimeRestartCoordinatorService
	signaler: RuntimeProcessSignaler
	lifecycle: RuntimeLifecycleService
	reportPluginState: (state: RuntimePluginState) => void
}

const requirement: IRuntimePluginRequirement = {
	scopeKey: 'org-1',
	pluginName: '@xpert-ai/plugin-openrouter',
	version: '0.1.0',
	state: 'loaded'
}

describe('RuntimeRestartCoordinatorService', () => {
	let redis: FakeRedis
	let nodes: RuntimeNode[]

	beforeEach(() => {
		jest.useFakeTimers()
		redis = new FakeRedis()
		nodes = []
	})

	afterEach(async () => {
		await Promise.all(nodes.map((node) => node.coordinator.onModuleDestroy()))
		jest.useRealTimers()
	})

	it('rejects a delayed acknowledgement after a failure or after the active operation changes', async () => {
		const targets = new RuntimeRestartTargetStore(redis)
		const pending: RestartTargetState = {
			replicaId: 'api-1',
			expectedBootId: 'boot-1',
			status: 'pending',
			updatedAt: new Date().toISOString()
		}
		await redis.set('xpert:system:runtime:restart:active', 'restart-1')
		await targets.initialize('restart-1', pending)
		const failed: RestartTargetState = { ...pending, status: 'failed', error: 'Replica disappeared' }
		expect(await targets.update('restart-1', pending, failed)).toBe(true)
		expect(await targets.update('restart-1', pending, { ...pending, status: 'completed' })).toBe(false)
		expect(await targets.read('restart-1')).toEqual([failed])
		await redis.set('xpert:system:runtime:restart:active', 'restart-2')
		expect(await targets.update('restart-1', failed, { ...failed, status: 'completed' })).toBe(false)
	})

	it('includes a registered API even when its coordinator starts more than two seconds later', async () => {
		const ready = await createNode(redis, 'api-1', 'boot-1', loadedPluginState())
		const delayed = await createNode(redis, 'api-2', 'boot-1', oldPluginState(), false)
		nodes.push(ready, delayed)
		const change = await ready.coordinator.recordPluginChange({
			pluginName: requirement.pluginName,
			version: requirement.version,
			scopeKey: requirement.scopeKey
		})
		await advance(5_000)
		await expect(ready.coordinator.getPluginConvergenceStatus(change.generation)).resolves.toMatchObject({
			status: 'in_progress',
			targetReplicaCount: 2,
			completedReplicaCount: 1
		})
		await delayed.coordinator.onModuleInit()
		delayed.coordinator.onApplicationBootstrap()
		await advance(2_000)
		expect(delayed.signaler.signal).toHaveBeenCalledWith('SIGTERM')
		await delayed.coordinator.onModuleDestroy()
		nodes.push(await createNode(redis, 'api-2', 'boot-2', loadedPluginState()))
		await advance(2_000)
		await expect(ready.coordinator.getPluginConvergenceStatus(change.generation)).resolves.toMatchObject({
			status: 'completed',
			targetReplicaCount: 2,
			completedReplicaCount: 2
		})
	})

	it('catches up a late replica after completed generation history has expired, without retrying a failed boot forever', async () => {
		const ready = await createNode(redis, 'api-1', 'boot-1', loadedPluginState())
		nodes.push(ready)
		const change = await ready.coordinator.recordPluginChange({
			pluginName: requirement.pluginName,
			version: requirement.version,
			scopeKey: requirement.scopeKey
		})
		await advance(3_000)
		await expect(ready.coordinator.getPluginConvergenceStatus(change.generation)).resolves.toMatchObject({
			status: 'completed'
		})
		jest.setSystemTime(Date.now() + 25 * 60 * 60_000)
		const late = await createNode(redis, 'api-late', 'boot-1', oldPluginState())
		nodes.push(late)
		await advance(3_000)
		expect(late.signaler.signal).toHaveBeenCalledTimes(1)
		await late.coordinator.onModuleDestroy()
		const failedReplacement = await createNode(redis, 'api-late', 'boot-2', oldPluginState())
		nodes.push(failedReplacement)
		await advance(10_000)
		expect(failedReplacement.signaler.signal).not.toHaveBeenCalled()
		await expect(redis.get('xpert:system:runtime:restart:active')).resolves.toBeNull()
		// An explicit retry is a new generation and may restart the failed replica again.
		await ready.coordinator.recordPluginChange({
			pluginName: requirement.pluginName,
			version: requirement.version,
			scopeKey: requirement.scopeKey
		})
		await advance(3_000)
		expect(failedReplacement.signaler.signal).toHaveBeenCalledTimes(1)
	})

	it.each([false, true])(
		'waits for application bootstrap and plugin state (reported before bootstrap: %s)',
		async (reported) => {
			const old = await createNode(redis, 'api-1', 'boot-1', oldPluginState())
			nodes.push(old)
			const change = await old.coordinator.recordPluginChange({
				pluginName: requirement.pluginName,
				version: requirement.version,
				scopeKey: requirement.scopeKey
			})
			await advance(3_000)
			await old.coordinator.onModuleDestroy()
			const replacement = await createNode(redis, 'api-1', 'boot-2', reported ? loadedPluginState() : null, false)
			nodes.push(replacement)
			await replacement.coordinator.onModuleInit()
			await advance(3_000)
			await expect(replacement.coordinator.getPluginConvergenceStatus(change.generation)).resolves.toMatchObject({
				status: 'in_progress',
				completedReplicaCount: 0
			})
			replacement.coordinator.onApplicationBootstrap()
			await advance(3_000)
			expect(replacement.signaler.signal).not.toHaveBeenCalled()
			if (!reported) {
				await expect(
					replacement.coordinator.getPluginConvergenceStatus(change.generation)
				).resolves.toMatchObject({
					status: 'in_progress',
					completedReplicaCount: 0
				})
				replacement.reportPluginState(loadedPluginState())
			}
			await advance(3_000)
			await expect(replacement.coordinator.getPluginConvergenceStatus(change.generation)).resolves.toMatchObject({
				status: 'completed',
				completedReplicaCount: 1
			})
		}
	)

	it('retains a snapshotted missing replica after retirement and requires an explicit retry after failure', async () => {
		const ready = await createNode(redis, 'api-1', 'boot-1', loadedPluginState())
		nodes.push(ready, await createNode(redis, 'api-missing', 'boot-1', oldPluginState(), false))
		const change = await ready.coordinator.recordPluginChange({
			pluginName: requirement.pluginName,
			version: requirement.version,
			scopeKey: requirement.scopeKey
		})
		redis.members.delete('api-missing')
		await advance(47_000)
		await expect(ready.coordinator.getPluginConvergenceStatus(change.generation)).resolves.toMatchObject({
			status: 'failed',
			targetReplicaCount: 2,
			completedReplicaCount: 1,
			failedReplicaCount: 1
		})
		const returned = await createNode(redis, 'api-missing', 'boot-1', oldPluginState())
		nodes.push(returned)
		await advance(3_000)
		expect(returned.signaler.signal).not.toHaveBeenCalled()
	})

	it('keeps a responsive API online when another registered member never responds', async () => {
		const responsive = await createNode(redis, 'api-1', 'boot-1', emptyPluginState())
		nodes.push(responsive, await createNode(redis, 'api-missing', 'boot-1', emptyPluginState(), false))
		const restart = await responsive.coordinator.requestRestart({ source: 'interactive' })
		await advance(47_000)
		expect(responsive.signaler.signal).not.toHaveBeenCalled()
		await expect(responsive.coordinator.getStatus(restart.restartId)).resolves.toMatchObject({
			status: 'failed',
			targetReplicaCount: 2,
			failedReplicaCount: 1
		})
	})

	it('atomically rejects catch-up admission after a completed outcome becomes failed or superseded', async () => {
		const store = new PluginRuntimeGenerationStore(redis)
		const generation = await store.publish({ generation: 0, requirements: [requirement], source: 'plugin-change' })
		await store.writeState({ generation, status: 'completed' })
		const snapshot = await store.readDesired()
		expect(snapshot?.status).toBe('completed')
		await store.writeState({ generation, status: 'failed' })
		// A late successful callback must not erase a recorded failure.
		await store.writeState({ generation, status: 'completed' })
		await expect(store.claimCatchUp(generation, 'stale-catch-up', 60_000)).resolves.toBe(false)
		jest.setSystemTime(Date.now() + 25 * 60 * 60_000)
		await expect(store.readDesired()).resolves.toMatchObject({ generation, status: 'failed' })
		const next = await store.publish({ generation: 0, requirements: [requirement], source: 'plugin-change' })
		await store.writeState({ generation: next, status: 'completed' })
		await expect(store.claimCatchUp(generation, 'old-catch-up', 60_000)).resolves.toBe(false)
		await expect(store.claimCatchUp(next, 'new-catch-up', 60_000)).resolves.toBe(true)
		await expect(store.claimCatchUp(next, 'duplicate-catch-up', 60_000)).resolves.toBe(false)
	})

	it('keeps a failed generation blocked after history expiry until an explicit new generation', async () => {
		const responsive = await createNode(redis, 'api-1', 'boot-1', oldPluginState())
		nodes.push(responsive, await createNode(redis, 'api-offline', 'boot-1', oldPluginState(), false))
		const change = await responsive.coordinator.recordPluginChange(requirement)
		await advance(50_000)
		await expect(responsive.coordinator.getPluginConvergenceStatus(change.generation)).resolves.toMatchObject({
			status: 'failed'
		})
		expect(responsive.signaler.signal).not.toHaveBeenCalled()
		jest.setSystemTime(Date.now() + 25 * 60 * 60_000)
		await advance(3_000)
		expect(responsive.signaler.signal).not.toHaveBeenCalled()
		// Explicit retirement affects the next snapshot, never the failed operation's count.
		redis.members.delete('api-offline')
		await responsive.coordinator.recordPluginChange(requirement)
		await advance(3_000)
		expect(responsive.signaler.signal).toHaveBeenCalledTimes(1)
	})

	it('checks every registered member before late catch-up and does not retry a failed catch-up', async () => {
		const ready = await createNode(redis, 'api-1', 'boot-1', loadedPluginState())
		nodes.push(ready)
		await ready.coordinator.recordPluginChange(requirement)
		await advance(3_000)
		nodes.push(await createNode(redis, 'api-offline', 'boot-1', oldPluginState(), false))
		const late = await createNode(redis, 'api-late', 'boot-1', oldPluginState())
		nodes.push(late)
		await advance(55_000)
		expect(late.signaler.signal).not.toHaveBeenCalled()
		await expect(redis.get('xpert:system:runtime:restart:active')).resolves.toBeNull()
		jest.setSystemTime(Date.now() + 25 * 60 * 60_000)
		await advance(3_000)
		expect(late.signaler.signal).not.toHaveBeenCalled()
		await expect(redis.get('xpert:system:runtime:restart:active')).resolves.toBeNull()
	})

	it('replaces the desired loaded entry on uninstall and keeps correctly unloaded new replicas online', async () => {
		const ready = await createNode(redis, 'api-1', 'boot-1', loadedPluginState())
		const stale = await createNode(redis, 'api-2', 'boot-1', loadedPluginState())
		nodes.push(ready, stale)
		await ready.coordinator.recordPluginChange(requirement)
		await advance(3_000)
		ready.reportPluginState(emptyPluginState())
		const removal = await ready.coordinator.recordPluginRequirements(
			[{ scopeKey: requirement.scopeKey, pluginName: requirement.pluginName, state: 'absent' }],
			'Uninstall plugin'
		)
		await advance(3_000)
		expect(ready.signaler.signal).not.toHaveBeenCalled()
		expect(stale.signaler.signal).toHaveBeenCalledTimes(1)
		await stale.coordinator.onModuleDestroy()
		nodes.push(await createNode(redis, 'api-2', 'boot-2', emptyPluginState()))
		await advance(3_000)
		await expect(ready.coordinator.getPluginConvergenceStatus(removal.generation)).resolves.toMatchObject({
			status: 'completed'
		})
		jest.setSystemTime(Date.now() + 25 * 60 * 60_000)
		const late = await createNode(redis, 'api-new', 'boot-1', emptyPluginState())
		nodes.push(late)
		await advance(5_000)
		expect(late.signaler.signal).not.toHaveBeenCalled()
		await expect(redis.get('xpert:system:runtime:restart:active')).resolves.toBeNull()
	})

	it('restarts manually staged replicas in bounded batches', async () => {
		const replicaIds = Array.from({ length: 10 }, (_, index) => `api-${index + 1}`)
		for (const replicaId of replicaIds) {
			nodes.push(await createNode(redis, replicaId, `${replicaId}-boot-1`, emptyPluginState()))
		}

		const restart = await nodes[0].coordinator.requestRestart({ source: 'interactive' })
		await advance(2_750)

		for (let completed = 0; completed < replicaIds.length; ) {
			const oldNodes = nodes.filter(
				(node) => node.bootId.endsWith('-boot-1') && jest.mocked(node.signaler.signal).mock.calls.length > 0
			)
			expect(oldNodes).toHaveLength(Math.min(2, replicaIds.length - completed))

			for (const oldNode of oldNodes) {
				await oldNode.coordinator.onModuleDestroy()
				nodes = nodes.filter((node) => node !== oldNode)
				nodes.push(
					await createNode(redis, oldNode.replicaId, `${oldNode.replicaId}-boot-2`, emptyPluginState())
				)
			}
			completed += oldNodes.length
			await advance(1_000)
		}

		await advance(1_000)
		await expect(nodes[0].coordinator.getStatus(restart.restartId)).resolves.toMatchObject({
			status: 'completed',
			targetReplicaCount: 10,
			completedReplicaCount: 10,
			failedReplicaCount: 0
		})
	})

	it('keeps a valid nine-replica rollout alive beyond the fixed fifteen-minute window', async () => {
		const replicaIds = Array.from({ length: 9 }, (_, index) => `api-${index + 1}`)
		for (const replicaId of replicaIds) {
			nodes.push(await createNode(redis, replicaId, `${replicaId}-boot-1`, emptyPluginState()))
		}

		const restart = await nodes[0].coordinator.requestRestart({ source: 'interactive' })
		await advance(2_750)

		for (let completed = 0; completed < replicaIds.length; completed += 1) {
			const oldNodes = nodes.filter(
				(node) => node.bootId.endsWith('-boot-1') && jest.mocked(node.signaler.signal).mock.calls.length > 0
			)
			expect(oldNodes).toHaveLength(1)
			const [oldNode] = oldNodes
			await oldNode.coordinator.onModuleDestroy()
			nodes = nodes.filter((node) => node !== oldNode)

			await advance(100_000)
			nodes.push(await createNode(redis, oldNode.replicaId, `${oldNode.replicaId}-boot-2`, emptyPluginState()))
			await advance(2_000)
		}

		await advance(1_000)
		await expect(nodes[0].coordinator.getStatus(restart.restartId)).resolves.toMatchObject({
			status: 'completed',
			targetReplicaCount: 9,
			completedReplicaCount: 9,
			failedReplicaCount: 0
		})
	})

	it('marks an operation failed when its server-owned deadline expires', async () => {
		for (const replicaId of ['api-1', 'api-2', 'api-3']) {
			nodes.push(await createNode(redis, replicaId, `${replicaId}-boot-1`, emptyPluginState()))
		}
		const restart = await nodes[0].coordinator.requestRestart({ source: 'interactive' })
		await advance(2_750)

		const metadataKey = `xpert:system:runtime:restart:${restart.restartId}:metadata`
		const metadataValue = await redis.get(metadataKey)
		expect(metadataValue).not.toBeNull()
		if (!metadataValue) throw new Error('Expected restart metadata')
		await redis.set(
			metadataKey,
			JSON.stringify({ ...JSON.parse(metadataValue), deadlineAt: new Date(Date.now() - 1).toISOString() }),
			{ EX: 900 }
		)

		await advance(1_000)

		await expect(nodes[0].coordinator.getStatus(restart.restartId)).resolves.toMatchObject({
			status: 'failed',
			error: expect.stringContaining('exceeded its server deadline')
		})
		await expect(redis.get('xpert:system:runtime:restart:active')).resolves.toBeNull()
	})

	it('does not restart a single API that already hot-loaded an organization plugin', async () => {
		const node = await createNode(redis, 'api-1', 'api-1-boot-1', loadedPluginState())
		nodes.push(node)

		const change = await node.coordinator.recordPluginChange({
			pluginName: requirement.pluginName,
			version: requirement.version,
			scopeKey: requirement.scopeKey
		})
		expect(change).toEqual({ scheduled: true, generation: 1 })
		await advance(3_000)

		expect(node.signaler.signal).not.toHaveBeenCalled()
		await expect(node.coordinator.getPluginConvergenceStatus(change.generation)).resolves.toMatchObject({
			status: 'completed',
			targetReplicaCount: 1,
			completedReplicaCount: 1
		})
		await expect(redis.get('xpert:system:runtime:restart:active')).resolves.toBeNull()
	})

	it('restarts replicas whose code revision is stale even when the package version matches', async () => {
		const currentRevision = 'workspace:current-source'
		nodes.push(await createNode(redis, 'api-1', 'api-1-boot-1', loadedPluginState(currentRevision)))
		nodes.push(await createNode(redis, 'api-2', 'api-2-boot-1', loadedPluginState('workspace:old-source')))

		const change = await nodes[0].coordinator.recordPluginChange({
			pluginName: requirement.pluginName,
			version: requirement.version,
			runtimeRevision: currentRevision,
			scopeKey: requirement.scopeKey
		})
		await advance(2_750)

		expect(nodes.find((node) => node.replicaId === 'api-1')?.signaler.signal).not.toHaveBeenCalled()
		const staleNode = nodes.find((node) => node.replicaId === 'api-2')
		expect(staleNode?.signaler.signal).toHaveBeenCalledWith('SIGTERM')
		if (!staleNode) throw new Error('Expected the stale API replica')
		await staleNode.coordinator.onModuleDestroy()
		nodes = nodes.filter((node) => node !== staleNode)
		nodes.push(await createNode(redis, 'api-2', 'api-2-boot-2', loadedPluginState(currentRevision)))
		await advance(2_000)

		await expect(nodes[0].coordinator.getPluginConvergenceStatus(change.generation)).resolves.toMatchObject({
			status: 'completed',
			targetReplicaCount: 2,
			completedReplicaCount: 2
		})
	})

	it('keeps the hot-loaded API online while stale replicas restart in bounded batches', async () => {
		nodes.push(await createNode(redis, 'api-1', 'api-1-boot-1', loadedPluginState()))
		nodes.push(await createNode(redis, 'api-2', 'api-2-boot-1', emptyPluginState()))
		for (let index = 3; index <= 10; index += 1) {
			nodes.push(await createNode(redis, `api-${index}`, `api-${index}-boot-1`, oldPluginState()))
		}

		const change = await nodes[0].coordinator.recordPluginChange({
			pluginName: requirement.pluginName,
			version: requirement.version,
			scopeKey: requirement.scopeKey
		})
		await advance(2_750)
		expect(nodes.find((node) => node.replicaId === 'api-1')?.signaler.signal).not.toHaveBeenCalled()

		for (let completed = 0; completed < 9; ) {
			const oldNodes = nodes.filter(
				(node) => node.replicaId !== 'api-1' && jest.mocked(node.signaler.signal).mock.calls.length > 0
			)
			expect(oldNodes).toHaveLength(Math.min(2, 9 - completed))
			for (const oldNode of oldNodes) {
				await oldNode.coordinator.onModuleDestroy()
				nodes = nodes.filter((node) => node !== oldNode)
				nodes.push(
					await createNode(redis, oldNode.replicaId, `${oldNode.replicaId}-boot-2`, loadedPluginState())
				)
			}
			completed += oldNodes.length
			await advance(1_000)
		}

		await advance(1_000)
		expect(nodes.filter((node) => node.bootId.endsWith('-boot-2'))).toHaveLength(9)
		await expect(nodes[0].coordinator.getPluginConvergenceStatus(change.generation)).resolves.toMatchObject({
			status: 'completed',
			targetReplicaCount: 10,
			completedReplicaCount: 10
		})
	})

	it('fails convergence when a replacement boot reports the wrong plugin version', async () => {
		nodes.push(await createNode(redis, 'api-1', 'api-1-boot-1', loadedPluginState()))
		nodes.push(await createNode(redis, 'api-2', 'api-2-boot-1', oldPluginState()))
		const change = await nodes[0].coordinator.recordPluginChange({
			pluginName: requirement.pluginName,
			version: requirement.version,
			scopeKey: requirement.scopeKey
		})
		await advance(2_750)

		const staleNode = nodes.find((node) => node.replicaId === 'api-2')
		expect(staleNode?.signaler.signal).toHaveBeenCalledWith('SIGTERM')
		if (!staleNode) throw new Error('Expected stale API replica')
		await staleNode.coordinator.onModuleDestroy()
		nodes = nodes.filter((node) => node !== staleNode)
		nodes.push(await createNode(redis, 'api-2', 'api-2-boot-2', oldPluginState()))
		await advance(2_000)

		await expect(nodes[0].coordinator.getPluginConvergenceStatus(change.generation)).resolves.toMatchObject({
			status: 'failed',
			failedReplicaCount: 1,
			error: expect.stringContaining('loaded 0.0.2 instead of 0.1.0')
		})
	})

	it('fails and releases the operation when a registered pending API disappears', async () => {
		for (const replicaId of ['api-1', 'api-2', 'api-3']) {
			nodes.push(await createNode(redis, replicaId, `${replicaId}-boot-1`, emptyPluginState()))
		}
		const restart = await nodes[0].coordinator.requestRestart({ source: 'interactive' })
		await advance(2_000)

		const targets = await readTargets(redis, restart.restartId)
		const pending = targets.find((target) => target.status === 'pending')
		expect(pending).toBeDefined()
		if (!pending) throw new Error('Expected a pending API participant')
		const disappeared = nodes.find((node) => node.replicaId === pending.replicaId)
		expect(disappeared).toBeDefined()
		if (!disappeared) throw new Error('Expected registered API participant')
		await disappeared.coordinator.onModuleDestroy()
		nodes = nodes.filter((node) => node !== disappeared)

		await advance(46_000)

		await expect(nodes[0].coordinator.getStatus(restart.restartId)).resolves.toMatchObject({
			status: 'failed',
			error: expect.stringContaining('disappeared before restart')
		})
		await expect(redis.get('xpert:system:runtime:restart:active')).resolves.toBeNull()
	})

	it('does not lose a queued generation when another plugin change starts during rollout handoff', async () => {
		const node = await createNode(redis, 'api-1', 'api-1-boot-1', loadedPluginState())
		nodes.push(node)

		const first = await node.coordinator.recordPluginChange({
			pluginName: requirement.pluginName,
			version: requirement.version,
			scopeKey: requirement.scopeKey
		})
		const queued = await node.coordinator.recordPluginChange({
			pluginName: requirement.pluginName,
			version: requirement.version,
			scopeKey: requirement.scopeKey
		})
		let concurrent: Awaited<ReturnType<RuntimeRestartCoordinatorService['recordPluginChange']>> | undefined
		redis.onActiveReleased = async () => {
			concurrent = await node.coordinator.recordPluginChange({
				pluginName: requirement.pluginName,
				version: requirement.version,
				scopeKey: requirement.scopeKey
			})
		}

		await advance(12_000)

		expect(concurrent).toBeDefined()
		if (!concurrent) throw new Error('Expected the concurrent plugin generation to be scheduled')
		await expect(node.coordinator.getPluginConvergenceStatus(first.generation)).resolves.toMatchObject({
			status: 'completed'
		})
		await expect(node.coordinator.getPluginConvergenceStatus(queued.generation)).resolves.toMatchObject({
			status: 'completed'
		})
		await expect(node.coordinator.getPluginConvergenceStatus(concurrent.generation)).resolves.toMatchObject({
			status: 'completed'
		})
	})

	it('publishes concurrent generations atomically before selecting their rollout', async () => {
		const node = await createNode(redis, 'api-1', 'api-1-boot-1', loadedPluginState())
		nodes.push(node)
		let releaseFirstPublication: (() => void) | undefined
		const releaseFirst = new Promise<void>((resolve) => {
			releaseFirstPublication = resolve
		})
		redis.onGenerationPublished = async (generation) => {
			if (generation !== 1) return
			await releaseFirst
		}

		const firstPromise = node.coordinator.recordPluginChange({
			pluginName: requirement.pluginName,
			version: requirement.version,
			scopeKey: requirement.scopeKey
		})
		await Promise.resolve()
		await Promise.resolve()
		const secondPromise = node.coordinator.recordPluginChange({
			pluginName: requirement.pluginName,
			version: requirement.version,
			scopeKey: requirement.scopeKey
		})
		releaseFirstPublication?.()
		const [first, second] = await Promise.all([firstPromise, secondPromise])
		expect(first.generation).toBe(1)
		expect(second.generation).toBe(2)
		await advance(8_000)

		await expect(node.coordinator.getPluginConvergenceStatus(first.generation)).resolves.toMatchObject({
			status: 'completed'
		})
		await expect(node.coordinator.getPluginConvergenceStatus(second.generation)).resolves.toMatchObject({
			status: 'completed'
		})
	})

	it('queues staged runtime requirements behind an active restart and completes their generation', async () => {
		const node = await createNode(redis, 'api-1', 'api-1-boot-1', emptyPluginState())
		nodes.push(node)
		const active = await node.coordinator.requestRestart({ source: 'interactive' })
		const queued = await node.coordinator.requestRestart({
			source: 'interactive',
			runtimeRequirements: [requirement]
		})

		expect(queued.restartId).toBe(active.restartId)
		expect(queued.pluginGeneration).toBe(1)
		await advance(2_750)
		expect(node.signaler.signal).toHaveBeenCalledWith('SIGTERM')

		await node.coordinator.onModuleDestroy()
		nodes = []
		nodes.push(await createNode(redis, 'api-1', 'api-1-boot-2', loadedPluginState()))
		await advance(5_000)

		await expect(nodes[0].coordinator.getPluginConvergenceStatus(1)).resolves.toMatchObject({
			status: 'completed'
		})
	})
})

async function createNode(
	redis: FakeRedis,
	replicaId: string,
	bootId: string,
	initialState: RuntimePluginState | null,
	start = true
): Promise<RuntimeNode> {
	redis.members.set(replicaId, { instanceId: replicaId, bootId })
	const registry = {
		instanceId: replicaId,
		bootId,
		getRegisteredInstances: async () => Array.from(redis.members.values()),
		getPluginState: () => initialState
	} satisfies Pick<InstanceRegistryService, 'instanceId' | 'bootId' | 'getPluginState' | 'getRegisteredInstances'>
	const signaler: RuntimeProcessSignaler = { signal: jest.fn() }
	const lifecycle = new RuntimeLifecycleService()
	const coordinator = new RuntimeRestartCoordinatorService(redis, signaler, lifecycle, registry)
	if (start) {
		await coordinator.onModuleInit()
		coordinator.onApplicationBootstrap()
	}
	return {
		replicaId,
		bootId,
		coordinator,
		signaler,
		lifecycle,
		reportPluginState: (state) => {
			initialState = state
		}
	}
}

function emptyPluginState(): RuntimePluginState {
	return { reportedAt: new Date().toISOString(), plugins: [], failures: [] }
}

function loadedPluginState(runtimeRevision?: string): RuntimePluginState {
	return {
		reportedAt: new Date().toISOString(),
		plugins: [
			{
				scopeKey: requirement.scopeKey,
				pluginName: requirement.pluginName,
				version: requirement.version,
				...(runtimeRevision ? { runtimeRevision } : {})
			}
		],
		failures: []
	}
}

function oldPluginState(): RuntimePluginState {
	return {
		reportedAt: new Date().toISOString(),
		plugins: [
			{
				scopeKey: requirement.scopeKey,
				pluginName: requirement.pluginName,
				version: '0.0.2'
			}
		],
		failures: []
	}
}

async function readTargets(redis: FakeRedis, restartId: string) {
	const values = await redis.hGetAll(`xpert:system:runtime:restart:${restartId}:targets`)
	return Object.values(values).map(
		(value) => JSON.parse(value) as { replicaId: string; status: 'pending' | 'restarting' | 'completed' | 'failed' }
	)
}

async function advance(milliseconds: number) {
	await jest.advanceTimersByTimeAsync(milliseconds)
	await Promise.resolve()
	await Promise.resolve()
}
