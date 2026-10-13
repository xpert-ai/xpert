import type { RuntimeRestartCoordinatorService } from './runtime-restart-coordinator.service'
import { PluginRuntimeGenerationStore } from './plugin-runtime-generation.store'
import { RuntimeRestartTargetStore } from './runtime-restart-target.store'
import type { RestartTargetState } from './runtime-restart.types'

import {
	FakeRedis,
	RuntimeNode,
	requirement,
	createNode,
	emptyPluginState,
	loadedPluginState,
	oldPluginState,
	readTargets,
	advance
} from './runtime-restart.test-fixture'

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

	it('excludes an unready registration and catches it up after bootstrap', async () => {
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
			status: 'completed',
			targetReplicaCount: 1,
			completedReplicaCount: 1
		})
		await delayed.coordinator.onModuleInit()
		delayed.coordinator.onApplicationBootstrap()
		await advance(5_000)
		expect(delayed.signaler.signal).toHaveBeenCalledWith('SIGTERM')
		await delayed.coordinator.onModuleDestroy()
		nodes.push(await createNode(redis, 'api-2', 'boot-2', loadedPluginState()))
		await advance(5_000)
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
		await advance(6_000)
		await expect(ready.coordinator.getPluginConvergenceStatus(change.generation)).resolves.toMatchObject({
			status: 'completed'
		})
		jest.setSystemTime(Date.now() + 25 * 60 * 60_000)
		const late = await createNode(redis, 'api-late', 'boot-1', oldPluginState())
		nodes.push(late)
		await advance(6_000)
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
		await advance(6_000)
		expect(failedReplacement.signaler.signal).toHaveBeenCalledTimes(1)
	})

	it.each([false, true])(
		'waits for application bootstrap and plugin state (reported before bootstrap: %s)',
		async (reported) => {
			const old = await createNode(redis, 'api-1', 'boot-1', oldPluginState())
			nodes.push(old)
			const change = await old.coordinator.requestRestart({
				source: 'interactive',
				allowDowntime: true,
				runtimeRequirements: [requirement]
			})
			await advance(6_000)
			expect(old.signaler.signal).toHaveBeenCalledWith('SIGTERM')
			await old.coordinator.onModuleDestroy()
			const replacement = await createNode(redis, 'api-1', 'boot-2', reported ? loadedPluginState() : null, false)
			nodes.push(replacement)
			await replacement.coordinator.onModuleInit()
			await advance(6_000)
			await expect(
				replacement.coordinator.getPluginConvergenceStatus(change.pluginGeneration!)
			).resolves.toMatchObject({
				status: 'in_progress',
				completedReplicaCount: 0
			})
			replacement.coordinator.onApplicationBootstrap()
			await advance(6_000)
			expect(replacement.signaler.signal).not.toHaveBeenCalled()
			if (!reported) {
				await expect(
					replacement.coordinator.getPluginConvergenceStatus(change.pluginGeneration!)
				).resolves.toMatchObject({
					status: 'in_progress',
					completedReplicaCount: 0
				})
				replacement.reportPluginState(loadedPluginState())
			}
			await advance(6_000)
			await expect(
				replacement.coordinator.getPluginConvergenceStatus(change.pluginGeneration!)
			).resolves.toMatchObject({
				status: 'completed',
				completedReplicaCount: 1
			})
		}
	)

	it('retains a snapshotted missing replica after retirement and requires an explicit retry after failure', async () => {
		const ready = await createNode(redis, 'api-1', 'boot-1', loadedPluginState())
		nodes.push(ready, await createNode(redis, 'api-missing', 'boot-1', oldPluginState(), false))
		const stalled = redis.members.get('api-missing')
		if (stalled) stalled.ready = true
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
		await advance(6_000)
		expect(returned.signaler.signal).not.toHaveBeenCalled()
	})

	it('keeps a responsive API online when another registered member never responds', async () => {
		const responsive = await createNode(redis, 'api-1', 'boot-1', emptyPluginState())
		nodes.push(responsive, await createNode(redis, 'api-missing', 'boot-1', emptyPluginState(), false))
		const stalled = redis.members.get('api-missing')
		if (stalled) stalled.ready = true
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
		const stalled = redis.members.get('api-offline')
		if (stalled) stalled.ready = true
		const change = await responsive.coordinator.recordPluginChange(requirement)
		await advance(50_000)
		await expect(responsive.coordinator.getPluginConvergenceStatus(change.generation)).resolves.toMatchObject({
			status: 'failed'
		})
		expect(responsive.signaler.signal).not.toHaveBeenCalled()
		jest.setSystemTime(Date.now() + 25 * 60 * 60_000)
		await advance(6_000)
		expect(responsive.signaler.signal).not.toHaveBeenCalled()
		// A returned stale boot stays fenced; a healthy API can explicitly publish a new generation.
		expect(responsive.lifecycle.readiness().status).toBe('unready')
		const healthy = await createNode(redis, 'api-healthy', 'boot-1', loadedPluginState())
		nodes.push(healthy)
		await healthy.coordinator.recordPluginChange(requirement)
		await advance(6_000)
		expect(responsive.signaler.signal).toHaveBeenCalledTimes(1)
	})

	it('ignores offline history during catch-up and does not retry a failed catch-up', async () => {
		const ready = await createNode(redis, 'api-1', 'boot-1', loadedPluginState())
		nodes.push(ready)
		await ready.coordinator.recordPluginChange(requirement)
		await advance(6_000)
		nodes.push(await createNode(redis, 'api-offline', 'boot-1', oldPluginState(), false))
		const late = await createNode(redis, 'api-late', 'boot-1', oldPluginState())
		nodes.push(late)
		await advance(305_000)
		expect(late.signaler.signal).toHaveBeenCalledTimes(1)
		await expect(redis.get('xpert:system:runtime:restart:active')).resolves.toBeNull()
		jest.setSystemTime(Date.now() + 25 * 60 * 60_000)
		await advance(6_000)
		expect(late.signaler.signal).toHaveBeenCalledTimes(1)
		await expect(redis.get('xpert:system:runtime:restart:active')).resolves.toBeNull()
	})

	it('replaces the desired loaded entry on uninstall and keeps correctly unloaded new replicas online', async () => {
		const ready = await createNode(redis, 'api-1', 'boot-1', loadedPluginState())
		const stale = await createNode(redis, 'api-2', 'boot-1', loadedPluginState())
		nodes.push(ready, stale)
		await ready.coordinator.recordPluginChange(requirement)
		await advance(6_000)
		ready.reportPluginState(emptyPluginState())
		const removal = await ready.coordinator.recordPluginRequirements(
			[{ scopeKey: requirement.scopeKey, pluginName: requirement.pluginName, state: 'absent' }],
			'Uninstall plugin'
		)
		await advance(6_000)
		expect(ready.signaler.signal).not.toHaveBeenCalled()
		expect(stale.signaler.signal).toHaveBeenCalledTimes(1)
		await stale.coordinator.onModuleDestroy()
		nodes.push(await createNode(redis, 'api-2', 'boot-2', emptyPluginState()))
		await advance(6_000)
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
		await advance(5_750)

		for (let completed = 0; completed < replicaIds.length; ) {
			const oldNodes = nodes.filter(
				(node) => node.bootId.endsWith('-boot-1') && jest.mocked(node.signaler.signal).mock.calls.length > 0
			)
			expect(oldNodes).toHaveLength(1)

			for (const oldNode of oldNodes) {
				await oldNode.coordinator.onModuleDestroy()
				nodes = nodes.filter((node) => node !== oldNode)
				nodes.push(
					await createNode(redis, oldNode.replicaId, `${oldNode.replicaId}-boot-2`, emptyPluginState())
				)
			}
			completed += oldNodes.length
			await advance(5_000)
		}

		await advance(5_000)
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
		await advance(5_750)

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
			await advance(5_000)
		}

		await advance(5_000)
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
		await advance(5_750)

		const metadataKey = `xpert:system:runtime:restart:${restart.restartId}:metadata`
		const metadataValue = await redis.get(metadataKey)
		expect(metadataValue).not.toBeNull()
		if (!metadataValue) throw new Error('Expected restart metadata')
		await redis.set(
			metadataKey,
			JSON.stringify({ ...JSON.parse(metadataValue), deadlineAt: new Date(Date.now() - 1).toISOString() }),
			{ EX: 900 }
		)

		await advance(5_000)

		await expect(nodes[0].coordinator.getStatus(restart.restartId)).resolves.toMatchObject({
			status: 'failed',
			error: expect.stringContaining('exceeded its server deadline')
		})
		await expect(redis.get('xpert:system:runtime:restart:active')).resolves.toBeNull()
	})

	it('keeps a staged single-replica installation pending until explicit outage approval', async () => {
		const node = await createNode(redis, 'api-1', 'boot-1', emptyPluginState())
		nodes.push(node)
		await advance(5_000)
		const change = await node.coordinator.recordPluginChange(requirement)
		await expect(node.coordinator.getPluginConvergenceStatus(change.generation)).resolves.toMatchObject({
			status: 'awaiting_restart'
		})
		await expect(redis.get('xpert:system:runtime:restart:active')).resolves.toBeNull()
		await advance(400_000)
		expect(node.signaler.signal).not.toHaveBeenCalled()
		expect(node.lifecycle.readiness().status).toBe('ready')
		await expect(node.coordinator.getPluginConvergenceStatus(change.generation)).resolves.toMatchObject({
			status: 'awaiting_restart'
		})
		await node.coordinator.requestRestart({
			source: 'interactive',
			allowDowntime: true,
			runtimeRequirements: [requirement]
		})
		await advance(5_000)
		expect(node.signaler.signal).toHaveBeenCalledTimes(1)
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
		await advance(6_000)

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
		await advance(5_750)

		expect(nodes.find((node) => node.replicaId === 'api-1')?.signaler.signal).not.toHaveBeenCalled()
		const staleNode = nodes.find((node) => node.replicaId === 'api-2')
		expect(staleNode?.signaler.signal).toHaveBeenCalledWith('SIGTERM')
		if (!staleNode) throw new Error('Expected the stale API replica')
		await staleNode.coordinator.onModuleDestroy()
		nodes = nodes.filter((node) => node !== staleNode)
		nodes.push(await createNode(redis, 'api-2', 'api-2-boot-2', loadedPluginState(currentRevision)))
		await advance(5_000)

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
		await advance(5_750)
		expect(nodes.find((node) => node.replicaId === 'api-1')?.signaler.signal).not.toHaveBeenCalled()

		for (let completed = 0; completed < 9; ) {
			const oldNodes = nodes.filter(
				(node) => node.replicaId !== 'api-1' && jest.mocked(node.signaler.signal).mock.calls.length > 0
			)
			expect(oldNodes).toHaveLength(1)
			for (const oldNode of oldNodes) {
				await oldNode.coordinator.onModuleDestroy()
				nodes = nodes.filter((node) => node !== oldNode)
				nodes.push(
					await createNode(redis, oldNode.replicaId, `${oldNode.replicaId}-boot-2`, loadedPluginState())
				)
			}
			completed += oldNodes.length
			await advance(5_000)
		}

		await advance(5_000)
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
		await advance(5_750)

		const staleNode = nodes.find((node) => node.replicaId === 'api-2')
		expect(staleNode?.signaler.signal).toHaveBeenCalledWith('SIGTERM')
		if (!staleNode) throw new Error('Expected stale API replica')
		await staleNode.coordinator.onModuleDestroy()
		nodes = nodes.filter((node) => node !== staleNode)
		nodes.push(await createNode(redis, 'api-2', 'api-2-boot-2', oldPluginState()))
		await advance(5_000)

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
		await advance(5_000)

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

	it('stops after one failed candidate while all other healthy replicas continue serving', async () => {
		for (let index = 1; index <= 3; index++)
			nodes.push(await createNode(redis, `api-${index}`, 'boot-1', oldPluginState()))
		const change = await nodes[0].coordinator.recordPluginChange(requirement)
		await advance(6_000)
		const candidates = nodes.filter((node) => jest.mocked(node.signaler.signal).mock.calls.length > 0)
		expect(candidates).toHaveLength(1)
		const [candidate] = candidates
		await candidate.coordinator.onModuleDestroy()
		nodes = nodes.filter((node) => node !== candidate)
		const replacement = await createNode(redis, candidate.replicaId, 'boot-2', oldPluginState())
		nodes.push(replacement)
		await advance(10_000)
		expect(replacement.lifecycle.readiness().status).toBe('unready')
		for (const healthy of nodes.filter((node) => node !== replacement)) {
			expect(healthy.signaler.signal).not.toHaveBeenCalled()
			expect(healthy.lifecycle.trackRequest()).toEqual(expect.any(Function))
		}
		await expect(replacement.coordinator.getPluginConvergenceStatus(change.generation)).resolves.toMatchObject({
			status: 'failed'
		})
	})

	it('cancels drain when another target fails before the termination signal', async () => {
		for (let index = 1; index <= 3; index++)
			nodes.push(await createNode(redis, `api-${index}`, 'boot-1', oldPluginState()))
		const releases = nodes.map((node) => node.lifecycle.trackRequest())
		const change = await nodes[0].coordinator.recordPluginChange(requirement)
		await advance(6_000)
		const draining = nodes.find((node) => node.lifecycle.readiness().status === 'draining')
		expect(draining).toBeDefined()
		const status = await nodes[0].coordinator.getPluginConvergenceStatus(change.generation)
		if (!status?.restartId) throw new Error('Missing restart')
		const store = new RuntimeRestartTargetStore(redis)
		const pending = (await store.read(status.restartId)).find((target) => target.status === 'pending')
		if (!pending) throw new Error('Missing pending target')
		await store.update(status.restartId, pending, { ...pending, status: 'failed', error: 'lost health' })
		await advance(2_000)
		releases.forEach((release) => release?.())
		await advance(6_000)
		for (const node of nodes) expect(node.signaler.signal).not.toHaveBeenCalled()
		expect(draining?.lifecycle.readiness().status).toBe('ready')
	})

	it('queues staged runtime requirements behind an active restart and completes their generation', async () => {
		const node = await createNode(redis, 'api-1', 'api-1-boot-1', emptyPluginState())
		nodes.push(node)
		const active = await node.coordinator.requestRestart({ source: 'interactive', allowDowntime: true })
		const queued = await node.coordinator.requestRestart({
			source: 'interactive',
			runtimeRequirements: [requirement]
		})

		expect(queued.restartId).toBe(active.restartId)
		expect(queued.pluginGeneration).toBe(1)
		await advance(5_750)
		expect(node.signaler.signal).toHaveBeenCalledWith('SIGTERM')

		await node.coordinator.onModuleDestroy()
		nodes = []
		nodes.push(await createNode(redis, 'api-1', 'api-1-boot-2', loadedPluginState()))
		await advance(8_000)

		await expect(nodes[0].coordinator.getPluginConvergenceStatus(1)).resolves.toMatchObject({
			status: 'completed'
		})
	})
})
