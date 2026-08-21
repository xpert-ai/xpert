import type { IRuntimePluginRequirement } from '@xpert-ai/contracts'
import { InstanceRegistryService, RuntimePluginState } from '../managed-connection'
import { RuntimeLifecycleService } from './runtime-lifecycle.service'
import { RuntimeProcessSignaler } from './runtime-process-signaler'
import { RuntimeRestartCoordinatorService } from './runtime-restart-coordinator.service'

type Listener = (message: string) => void

class FakeRedis {
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
	initialState: RuntimePluginState | null
): Promise<RuntimeNode> {
	const registry = {
		instanceId: replicaId,
		bootId,
		getPluginState: () => initialState
	} as InstanceRegistryService
	const signaler: RuntimeProcessSignaler = { signal: jest.fn() }
	const lifecycle = new RuntimeLifecycleService()
	const coordinator = new RuntimeRestartCoordinatorService(redis, signaler, lifecycle, registry)
	await coordinator.onModuleInit()
	return {
		replicaId,
		bootId,
		coordinator,
		signaler,
		lifecycle
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
