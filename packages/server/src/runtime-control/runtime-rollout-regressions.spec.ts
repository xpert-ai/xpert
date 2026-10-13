import { PluginRuntimeGenerationStore } from './plugin-runtime-generation.store'
import {
	advance,
	createNode,
	emptyPluginState,
	FakeRedis,
	loadedPluginState,
	oldPluginState,
	readTargets,
	requirement,
	RuntimeNode
} from './runtime-restart.test-fixture'

describe('Plugin rollout availability regressions', () => {
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

	it.each(['plugin-change', 'interactive'] as const)(
		'protects the last healthy replica for %s even with offline registrations',
		async (source) => {
			const healthy = await createNode(redis, 'api-1', 'boot-1', oldPluginState())
			nodes.push(
				healthy,
				await createNode(redis, 'api-2', 'boot-1', oldPluginState(), false),
				await createNode(redis, 'api-3', 'boot-1', oldPluginState(), false)
			)
			await advance(5_000)
			if (source === 'plugin-change') await healthy.coordinator.recordPluginChange(requirement)
			else await healthy.coordinator.requestRestart({ source })
			// The operation eventually fails its deadline without ever draining the remaining API.
			await advance(340_000)
			expect(healthy.signaler.signal).not.toHaveBeenCalled()
			expect(healthy.lifecycle.readiness().status).toBe('ready')
			expect(healthy.lifecycle.trackRequest()).toEqual(expect.any(Function))
		}
	)

	it('allows an explicitly approved single-replica outage', async () => {
		const node = await createNode(redis, 'api-1', 'boot-1', oldPluginState())
		nodes.push(node)
		await advance(5_000)
		await node.coordinator.requestRestart({
			source: 'interactive',
			allowDowntime: true,
			runtimeRequirements: [requirement]
		})
		await advance(5_000)
		expect(node.signaler.signal).toHaveBeenCalledTimes(1)
		expect(node.signaler.signal).toHaveBeenCalledWith('SIGTERM')
	})

	it('does not pass outage consent from an earlier operation to a queued automatic change', async () => {
		const node = await createNode(redis, 'api-1', 'boot-1', emptyPluginState())
		nodes.push(node)
		await advance(5_000)
		await node.coordinator.requestRestart({ source: 'interactive', allowDowntime: true })
		await advance(2_000)
		expect(node.signaler.signal).toHaveBeenCalledWith('SIGTERM')
		await node.coordinator.onModuleDestroy()
		const queued = await node.coordinator.recordPluginChange(requirement)
		const replacement = await createNode(redis, 'api-1', 'boot-2', emptyPluginState())
		nodes.push(replacement)
		await advance(12_000)
		expect(replacement.lifecycle.readiness().status).toBe('ready')
		expect(replacement.signaler.signal).not.toHaveBeenCalled()
		await expect(replacement.coordinator.getPluginConvergenceStatus(queued.generation)).resolves.toMatchObject({
			status: 'in_progress'
		})
	})

	it('cancels termination if its healthy peer disappears while requests drain', async () => {
		const first = await createNode(redis, 'api-1', 'boot-1', oldPluginState())
		const second = await createNode(redis, 'api-2', 'boot-1', oldPluginState())
		nodes.push(first, second)
		await advance(5_000)
		const releases = nodes.map((node) => node.lifecycle.trackRequest())
		await first.coordinator.recordPluginChange(requirement)
		await advance(1_000)
		const candidate = nodes.find((node) => node.lifecycle.readiness().status === 'draining')!
		expect(candidate).toBeDefined()
		const peer = nodes.find((node) => node !== candidate)!
		await peer.coordinator.onModuleDestroy()
		await advance(6_000)
		releases.forEach((release) => release?.())
		await advance(2_000)
		expect(candidate.signaler.signal).not.toHaveBeenCalled()
		expect(candidate.lifecycle.readiness().status).toBe('ready')
	})

	it('admits current-generation replacements while a newer plugin is queued, then completes both rollouts', async () => {
		const first = await createNode(redis, 'api-1', 'boot-1', oldPluginState())
		const second = await createNode(redis, 'api-2', 'boot-1', oldPluginState())
		nodes.push(first, second)
		await advance(5_000)
		const active = await first.coordinator.recordPluginChange(requirement)
		await advance(5_000)
		const candidate = nodes.find((node) => jest.mocked(node.signaler.signal).mock.calls.length > 0)!
		expect(candidate).toBeDefined()
		await candidate.coordinator.onModuleDestroy()
		const peer = nodes.find((node) => node !== candidate)!
		const future = { ...requirement, pluginName: '@test/future-plugin', version: '1' }
		const queued = await peer.coordinator.recordPluginChange(future)
		const replacement = await createNode(redis, candidate.replicaId, 'boot-2', loadedPluginState())
		nodes.push(replacement)
		await advance(5_000)
		const activeStatus = await first.coordinator.getPluginConvergenceStatus(active.generation)
		expect(await readTargets(redis, activeStatus!.restartId!)).toContainEqual(
			expect.objectContaining({ replicaId: candidate.replicaId, status: 'completed' })
		)
		expect(replacement.lifecycle.readiness().status).toBe('ready')
		expect(peer.signaler.signal).toHaveBeenCalledWith('SIGTERM')
		await peer.coordinator.onModuleDestroy()
		const peerReplacement = await createNode(redis, peer.replicaId, 'boot-2', loadedPluginState())
		nodes.push(peerReplacement)
		await advance(6_000)
		await expect(first.coordinator.getPluginConvergenceStatus(active.generation)).resolves.toMatchObject({
			status: 'completed'
		})
		const live = [replacement, peerReplacement]
		for (let round = 0; round < 2; round++) {
			const index = live.findIndex((node) => jest.mocked(node.signaler.signal).mock.calls.length > 0)
			expect(index).toBeGreaterThanOrEqual(0)
			const old = live[index]
			await old.coordinator.onModuleDestroy()
			const state = loadedPluginState()
			state.plugins.push(future)
			live[index] = await createNode(redis, old.replicaId, 'boot-3', state)
			nodes.push(live[index])
			await advance(6_000)
		}
		await expect(first.coordinator.getPluginConvergenceStatus(queued.generation)).resolves.toMatchObject({
			status: 'completed',
			completedReplicaCount: 2
		})
		expect(live.every((node) => node.lifecycle.readiness().status === 'ready')).toBe(true)
	})

	it('does not admit a replacement missing an earlier unchanged plugin or an unrelated stale boot', async () => {
		const prior = { ...requirement, pluginName: '@test/prior-plugin' }
		const state = oldPluginState()
		state.plugins.push(prior)
		const first = await createNode(redis, 'api-1', 'boot-1', state)
		const second = await createNode(redis, 'api-2', 'boot-1', state)
		nodes.push(first, second)
		await first.coordinator.recordPluginChange(prior)
		await advance(6_000)
		const active = await first.coordinator.recordPluginChange(requirement)
		await advance(5_000)
		const candidate = nodes.find((node) => jest.mocked(node.signaler.signal).mock.calls.length > 0)!
		expect(candidate).toBeDefined()
		await candidate.coordinator.onModuleDestroy()
		await second.coordinator.recordPluginChange({ ...requirement, pluginName: '@test/future-plugin' })
		const outsiderState = loadedPluginState()
		outsiderState.plugins.push(prior)
		const outsider = await createNode(redis, 'api-new', 'boot-1', outsiderState)
		nodes.push(outsider)
		await advance(1_000)
		// Matching this rollout is insufficient without being one of its planned replacements.
		expect(outsider.lifecycle.readiness().status).toBe('unready')
		const replacement = await createNode(redis, candidate.replicaId, 'boot-2', loadedPluginState())
		nodes.push(replacement)
		await advance(5_000)
		expect(replacement.lifecycle.readiness().status).toBe('unready')
		expect(outsider.lifecycle.readiness().status).toBe('unready')
		expect(
			(
				await readTargets(
					redis,
					(await first.coordinator.getPluginConvergenceStatus(active.generation))!.restartId!
				)
			).find((target) => target.replicaId === candidate.replicaId)?.status
		).toBe('failed')
	})

	it('retains an immutable cumulative manifest for each published generation', async () => {
		const store = new PluginRuntimeGenerationStore(redis)
		const first = await store.publish({ generation: 0, source: 'plugin-change', requirements: [requirement] })
		const other = { ...requirement, pluginName: '@test/other-plugin' }
		const second = await store.publish({ generation: 0, source: 'plugin-change', requirements: [other] })
		await store.publish({
			generation: 0,
			source: 'plugin-change',
			requirements: [{ ...requirement, version: '2' }]
		})
		expect(await store.readRequirements(first)).toEqual([requirement])
		expect(await store.readRequirements(second)).toEqual([requirement, other])
	})
})
