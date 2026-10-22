import { TRAFFIC_WITHDRAWAL_MS } from './runtime-traffic-withdrawal'
import type { IRuntimePluginRequirement } from '@xpert-ai/contracts'
import type { RuntimePluginState } from '../managed-connection/instance-registry.service'
import { PluginRuntimeGenerationStore } from './plugin-runtime-generation.store'
import type { RestartTargetState } from './runtime-restart.types'
import { advance, createNode, FakeRedis, RuntimeNode } from './runtime-restart.test-fixture'

function loaded(requirements: IRuntimePluginRequirement[]): RuntimePluginState {
	return {
		reportedAt: new Date().toISOString(),
		plugins: requirements.filter((item) => item.state === 'loaded'),
		failures: []
	}
}

describe('Bulk plugin update rolling convergence', () => {
	let redis: FakeRedis
	let nodes: RuntimeNode[]
	let live: RuntimeNode[]
	let store: PluginRuntimeGenerationStore
	const baseline: IRuntimePluginRequirement[] = Array.from({ length: 11 }, (_, index) => ({
		scopeKey: 'tenant-test',
		pluginName: `@test/app-${index}`,
		version: '1.0.0',
		state: 'loaded'
	}))
	beforeEach(() => {
		jest.useFakeTimers()
		redis = new FakeRedis()
		store = new PluginRuntimeGenerationStore(redis)
		nodes = []
		live = []
	})
	afterEach(async () => {
		await Promise.all(nodes.map((node) => node.destroy()))
		jest.useRealTimers()
	})

	async function startCluster(requirements = baseline) {
		const generation = await store.publish({ generation: 0, source: 'plugin-change', requirements })
		await store.writeState({ generation, status: 'completed' })
		for (let index = 1; index <= 3; index++) {
			const node = await createNode(redis, `api-${index}`, 'boot-1', loaded(requirements))
			nodes.push(node)
			live.push(node)
		}
		await advance(5_000 + TRAFFIC_WITHDRAWAL_MS)
	}

	function candidate() {
		const candidates = live.filter((node) => jest.mocked(node.signaler.signal).mock.calls.length > 0)
		expect(candidates).toHaveLength(1)
		expect(live.filter((node) => node.lifecycle.readiness().status === 'ready')).toHaveLength(2)
		return candidates[0]
	}

	function healthyPeer(candidate: RuntimeNode) {
		const peer = live.find((node) => node !== candidate && node.lifecycle.readiness().status === 'ready')
		if (!peer) throw new Error('Expected a healthy API peer')
		return peer
	}

	async function replace(old: RuntimeNode, state: RuntimePluginState) {
		await old.destroy()
		const replacement = await createNode(redis, old.replicaId, `${old.bootId}-next`, state)
		nodes.push(replacement)
		live[live.indexOf(old)] = replacement
		return replacement
	}

	async function advanceWithCapacity(milliseconds: number) {
		for (let elapsed = 0; elapsed < milliseconds; elapsed += 250) {
			await advance(250)
			expect(live.filter((node) => node.lifecycle.readiness().status === 'ready').length).toBeGreaterThanOrEqual(
				2
			)
		}
	}

	it.each(['latest', 'intermediate'] as const)(
		'converges 11 sequential updates when a replacement boot loads the %s published manifest',
		async (bootManifest) => {
			await startCluster()
			const updated = baseline.map((item) => ({ ...item, version: '1.0.1' }))
			const changes = [await live[0].coordinator.recordPluginChange(updated[0])]
			await advance(5_000 + TRAFFIC_WITHDRAWAL_MS)
			const first = candidate()
			const publisher = healthyPeer(first)
			await first.destroy()
			// Shared plugin configuration advances while the first process is restarting.
			changes.push(await publisher.coordinator.recordPluginChange(updated[1]))
			const intermediate = loaded([...updated.slice(0, 2), ...baseline.slice(2)])
			for (const plugin of updated.slice(2)) changes.push(await publisher.coordinator.recordPluginChange(plugin))
			const activation = await publisher.coordinator.requestRestart({
				source: 'interactive',
				runtimeRequirements: updated
			})
			if (activation.pluginGeneration === undefined) throw new Error('Expected a queued activation generation')
			const replacement = await replace(first, bootManifest === 'latest' ? loaded(updated) : intermediate)
			await advanceWithCapacity(5_000 + TRAFFIC_WITHDRAWAL_MS)
			expect(replacement.lifecycle.readiness().status).toBe('ready')
			await expect(
				publisher.coordinator.getPluginConvergenceStatus(changes[0].generation)
			).resolves.toMatchObject({
				status: 'in_progress',
				completedReplicaCount: 1,
				failedReplicaCount: 0
			})
			for (let round = 0; round < (bootManifest === 'latest' ? 2 : 3); round++) {
				await replace(candidate(), loaded(updated))
				await advanceWithCapacity(6_000 + TRAFFIC_WITHDRAWAL_MS)
			}
			await advanceWithCapacity(5_000 + TRAFFIC_WITHDRAWAL_MS)
			for (const generation of [...changes.map((change) => change.generation), activation.pluginGeneration]) {
				await expect(live[0].coordinator.getPluginConvergenceStatus(generation)).resolves.toMatchObject({
					status: 'completed',
					completedReplicaCount: 3,
					failedReplicaCount: 0
				})
			}
			expect(live.every((node) => node.lifecycle.readiness().status === 'ready')).toBe(true)
			expect(live.every((node) => jest.mocked(node.signaler.signal).mock.calls.length === 0)).toBe(true)
			await expect(redis.get('xpert:system:runtime:restart:active')).resolves.toBeNull()
			// A later update must not rewrite the admission snapshot retained for the earlier generation.
			expect(await store.readRequirements(changes[0].generation)).toEqual([updated[0], ...baseline.slice(1)])
		}
	)

	it.each(['version', 'runtimeRevision', 'removal'] as const)(
		'accepts a published superseding %s while retaining the queued generation for follow-up',
		async (changeKind) => {
			await startCluster()
			const firstUpdate = { ...baseline[0], version: '1.0.1', runtimeRevision: 'revision-1' }
			const first = await live[0].coordinator.recordPluginChange(firstUpdate)
			await advance(5_000 + TRAFFIC_WITHDRAWAL_MS)
			const old = candidate()
			const publisher = healthyPeer(old)
			const next: IRuntimePluginRequirement =
				changeKind === 'removal'
					? { ...baseline[0], state: 'absent' }
					: { ...firstUpdate, [changeKind]: changeKind === 'version' ? '1.0.2' : 'revision-2' }
			const queued = await publisher.coordinator.recordPluginRequirements([next], 'Next bulk update')
			const state = loaded([next, ...baseline.slice(1)])
			const replacement = await replace(old, state)
			await advance(5_000 + TRAFFIC_WITHDRAWAL_MS)
			expect(replacement.lifecycle.readiness().status).toBe('ready')
			for (let round = 0; round < 2; round++) {
				await replace(candidate(), state)
				await advance(6_000 + TRAFFIC_WITHDRAWAL_MS)
			}
			for (const generation of [first.generation, queued.generation]) {
				await expect(live[0].coordinator.getPluginConvergenceStatus(generation)).resolves.toMatchObject({
					status: 'completed',
					completedReplicaCount: 3
				})
			}
			expect(live.every((node) => node.lifecycle.readiness().status === 'ready')).toBe(true)
		}
	)

	it.each(['admission read', 'failure write'] as const)(
		'rechecks a replacement when another update publishes during its %s',
		async (publicationPoint) => {
			await startCluster()
			const firstUpdate = { ...baseline[0], version: '1.0.1' }
			const first = await live[0].coordinator.recordPluginChange(firstUpdate)
			await advance(5_000 + TRAFFIC_WITHDRAWAL_MS)
			const old = candidate()
			const publisher = healthyPeer(old)
			await old.destroy()
			const next = { ...baseline[1], version: '1.0.1' }
			const state = loaded([firstUpdate, next, ...baseline.slice(2)])
			const replacement = await createNode(redis, old.replicaId, 'boot-2', state, false)
			nodes.push(replacement)
			live[live.indexOf(old)] = replacement
			const readHash = redis.hGetAll.bind(redis)
			const evaluate = redis.eval.bind(redis)
			let queuedGeneration: number | undefined
			let publishOnce = true
			async function publishNext() {
				publishOnce = false
				queuedGeneration = (await publisher.coordinator.recordPluginChange(next)).generation
			}
			const readSpy = jest.spyOn(redis, 'hGetAll').mockImplementation(async (key) => {
				const snapshot = await readHash(key)
				if (
					publishOnce &&
					publicationPoint === 'admission read' &&
					key === 'xpert:system:plugin-runtime:desired'
				)
					await publishNext()
				return snapshot
			})
			const writeSpy = jest.spyOn(redis, 'eval').mockImplementation(async (script, options) => {
				if (
					publishOnce &&
					publicationPoint === 'failure write' &&
					script.includes('xpert-update-restart-target')
				) {
					const transition: RestartTargetState = JSON.parse(options.arguments[3])
					if (transition.status === 'failed') await publishNext()
				}
				return evaluate(script, options)
			})
			try {
				await replacement.coordinator.onModuleInit()
				replacement.admissionMonitor.onApplicationBootstrap()
				replacement.coordinator.onApplicationBootstrap()
				await advanceWithCapacity(6_000 + TRAFFIC_WITHDRAWAL_MS)
			} finally {
				readSpy.mockRestore()
				writeSpy.mockRestore()
			}
			expect(replacement.lifecycle.readiness().status).toBe('ready')
			if (queuedGeneration === undefined) throw new Error('Expected publication during admission')
			for (let round = 0; round < 2; round++) {
				await replace(candidate(), state)
				await advanceWithCapacity(6_000 + TRAFFIC_WITHDRAWAL_MS)
			}
			for (const generation of [first.generation, queuedGeneration]) {
				await expect(live[0].coordinator.getPluginConvergenceStatus(generation)).resolves.toMatchObject({
					status: 'completed',
					completedReplicaCount: 3,
					failedReplicaCount: 0
				})
			}
		}
	)

	it.each([
		'unpublished newer version',
		'unpublished older version',
		'wrong runtime revision',
		'missing unchanged plugin',
		'wrong scope',
		'mixed generations',
		'load failure',
		'expired intermediate snapshot'
	] as const)('rejects a replacement with %s and keeps the other two APIs serving', async (failure) => {
		await startCluster()
		const firstUpdate = { ...baseline[0], version: '1.0.1', runtimeRevision: 'revision-1' }
		const first = await live[0].coordinator.recordPluginChange(firstUpdate)
		await advance(5_000 + TRAFFIC_WITHDRAWAL_MS)
		const old = candidate()
		const publisher = healthyPeer(old)
		const secondUpdate = { ...baseline[1], version: '1.0.1' }
		const middle = await publisher.coordinator.recordPluginChange(secondUpdate)
		const next = { ...firstUpdate, version: '1.0.2', runtimeRevision: 'revision-2' }
		const last = await publisher.coordinator.recordPluginChange(next)
		const state = loaded([next, secondUpdate, ...baseline.slice(2)])
		switch (failure) {
			case 'unpublished newer version':
				state.plugins[0] = { ...next, version: '9.0.0' }
				break
			case 'unpublished older version':
				state.plugins[0] = { ...next, version: '0.9.0' }
				break
			case 'wrong runtime revision':
				state.plugins[0] = { ...next, runtimeRevision: 'unpublished-revision' }
				break
			case 'missing unchanged plugin':
				state.plugins.pop()
				break
			case 'wrong scope':
				state.plugins[1] = { ...secondUpdate, scopeKey: 'another-tenant' }
				break
			case 'mixed generations':
				// Each version was published, but no published manifest contains this combination.
				state.plugins[1] = baseline[1]
				break
			case 'load failure':
				state.failures.push({ ...next, error: 'Plugin bootstrap failed' })
				break
			case 'expired intermediate snapshot':
				state.plugins[0] = firstUpdate
				redis.values.delete(`xpert:system:plugin-runtime:generation:${middle.generation}:requirements`)
				break
		}
		const replacement = await replace(old, state)
		await advanceWithCapacity(10_000)
		expect(replacement.lifecycle.readiness().status).toBe('unready')
		expect(replacement.lifecycle.trackRequest()).toBeNull()
		for (const peer of live.filter((node) => node !== replacement)) {
			expect(peer.signaler.signal).not.toHaveBeenCalled()
			const release = peer.lifecycle.trackRequest()
			expect(release).toEqual(expect.any(Function))
			release?.()
		}
		for (const generation of [first.generation, middle.generation, last.generation]) {
			await expect(publisher.coordinator.getPluginConvergenceStatus(generation)).resolves.toMatchObject({
				status: 'failed',
				failedReplicaCount: 1
			})
		}
	})
})
