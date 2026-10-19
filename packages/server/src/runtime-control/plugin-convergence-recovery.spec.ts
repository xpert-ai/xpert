import { PluginRuntimeGenerationStore } from './plugin-runtime-generation.store'
import {
	advance,
	createNode,
	FakeRedis,
	loadedPluginState,
	oldPluginState,
	requirement,
	type RuntimeNode
} from './runtime-restart.test-fixture'

describe('Plugin convergence capacity recovery', () => {
	let redis: FakeRedis
	let nodes: RuntimeNode[]
	let generations: PluginRuntimeGenerationStore
	beforeEach(() => {
		jest.useFakeTimers()
		redis = new FakeRedis()
		nodes = []
		generations = new PluginRuntimeGenerationStore(redis)
	})
	afterEach(async () => {
		await Promise.all(nodes.map((node) => node.coordinator.onModuleDestroy()))
		jest.useRealTimers()
	})

	it('resumes the same waiting generation when a second ready replica returns', async () => {
		const first = await createNode(redis, 'api-1', 'boot-1', oldPluginState())
		nodes.push(first)
		const { generation } = await first.coordinator.recordPluginChange(requirement)
		await advance(10_000)
		expect(await generations.readState(generation)).toMatchObject({ status: 'awaiting_restart' })
		expect(first.signaler.signal).not.toHaveBeenCalled()

		const second = await createNode(redis, 'api-2', 'boot-2', loadedPluginState())
		nodes.push(second)
		await advance(6_000)
		expect(first.signaler.signal).toHaveBeenCalledTimes(1)
		expect(second.signaler.signal).not.toHaveBeenCalled()
		expect(second.lifecycle.readiness().status).toBe('ready')
		const restartId = (await generations.readState(generation))?.restartId
		expect(restartId).toEqual(expect.any(String))
		await first.coordinator.onModuleDestroy()
		const replacement = await createNode(redis, 'api-1', 'boot-2', loadedPluginState())
		nodes.push(replacement)
		await advance(10_000)
		expect(await generations.current()).toBe(generation)
		expect(await generations.readState(generation)).toMatchObject({ status: 'completed', restartId })
		expect(replacement.lifecycle.readiness().status).toBe('ready')
		expect(replacement.signaler.signal).not.toHaveBeenCalled()
		expect(await redis.get('xpert:system:runtime:restart:active')).toBeNull()
	})

	it('does not let an unready observer start a rollout against the last ready replica', async () => {
		const first = await createNode(redis, 'api-1', 'boot-1', oldPluginState())
		nodes.push(first)
		const { generation } = await first.coordinator.recordPluginChange(requirement)
		const unready = await createNode(redis, 'api-2', 'boot-1', oldPluginState())
		nodes.push(unready)
		await advance(20_000)
		expect(unready.lifecycle.readiness().status).not.toBe('ready')
		expect(await generations.readState(generation)).toMatchObject({ status: 'awaiting_restart' })
		expect(await redis.get('xpert:system:runtime:restart:active')).toBeNull()
		for (const node of nodes) expect(node.signaler.signal).not.toHaveBeenCalled()
	})

	it('completes a waiting generation without another restart after manual recovery', async () => {
		const first = await createNode(redis, 'api-1', 'boot-1', oldPluginState())
		nodes.push(first)
		const { generation } = await first.coordinator.recordPluginChange(requirement)
		await first.coordinator.onModuleDestroy()
		const replacement = await createNode(redis, 'api-1', 'boot-2', loadedPluginState())
		nodes.push(replacement)
		await advance(10_000)
		expect(await generations.readState(generation)).toMatchObject({ status: 'completed' })
		for (const node of nodes) expect(node.signaler.signal).not.toHaveBeenCalled()
	})

	it('leaves zero-ready capacity pending without creating an empty rollout', async () => {
		const generation = await generations.publish({
			generation: 0,
			source: 'plugin-change',
			requirements: [requirement]
		})
		const unready = await createNode(redis, 'api-1', 'boot-1', oldPluginState())
		nodes.push(unready)
		await advance(10_000)
		expect(await generations.readState(generation)).toMatchObject({ status: 'in_progress' })
		expect(await redis.get('xpert:system:runtime:restart:active')).toBeNull()
		expect(unready.signaler.signal).not.toHaveBeenCalled()
	})

	it('keeps failed outcomes blocked when capacity recovers', async () => {
		const generation = await generations.publish({
			generation: 0,
			source: 'plugin-change',
			requirements: [requirement]
		})
		await generations.writeState({ generation, status: 'failed', error: 'Previous rollout failed' })
		nodes.push(await createNode(redis, 'api-1', 'boot-1', loadedPluginState()))
		nodes.push(await createNode(redis, 'api-2', 'boot-1', loadedPluginState()))
		await advance(10_000)
		expect(await generations.readState(generation)).toMatchObject({ status: 'failed' })
		expect(await generations.readPending()).toEqual([])
		expect(await redis.get('xpert:system:runtime:restart:active')).toBeNull()
	})

	it('applies explicit outage approval to the waiting snapshot and completes both generations', async () => {
		const first = await createNode(redis, 'api-1', 'boot-1', oldPluginState())
		nodes.push(first)
		const waiting = await first.coordinator.recordPluginChange(requirement)
		const approved = await first.coordinator.requestRestart({
			source: 'interactive',
			allowDowntime: true,
			runtimeRequirements: [requirement]
		})
		await advance(5_000)
		expect(first.signaler.signal).toHaveBeenCalledTimes(1)
		await first.coordinator.onModuleDestroy()
		nodes.push(await createNode(redis, 'api-1', 'boot-2', loadedPluginState()))
		await advance(10_000)
		for (const generation of [waiting.generation, approved.pluginGeneration!]) {
			expect(await generations.readState(generation)).toMatchObject({
				status: 'completed',
				restartId: approved.restartId
			})
		}
	})

	it('does not carry approval forward to a later queued automatic generation', async () => {
		const node = await createNode(redis, 'api-1', 'boot-1', oldPluginState())
		nodes.push(node)
		await generations.publish({
			generation: 0,
			source: 'interactive',
			allowDowntime: true,
			requirements: [requirement]
		})
		const generation = await generations.publish({
			generation: 0,
			source: 'plugin-change',
			requirements: [requirement]
		})
		await advance(10_000)
		expect(node.signaler.signal).not.toHaveBeenCalled()
		expect(await generations.readState(generation)).toMatchObject({ status: 'awaiting_restart' })
		expect(await redis.get('xpert:system:runtime:restart:active')).toBeNull()
	})

	it.each(['active', 'in_progress', 'completed', 'failed'] as const)(
		'rejects a delayed capacity-wait write after the rollout becomes %s',
		async (phase) => {
			const generation = await generations.publish({
				generation: 0,
				source: 'plugin-change',
				requirements: [requirement]
			})
			if (phase === 'active') await redis.set('xpert:system:runtime:restart:active', 'restart-1')
			else {
				await redis.set('xpert:system:runtime:restart:active', 'restart-1')
				await generations.writeState({ generation, status: phase, restartId: 'restart-1' })
				redis.values.delete('xpert:system:runtime:restart:active')
			}
			const before = await generations.readState(generation)
			const desiredBefore = await generations.readDesired()
			await generations.writeState({ generation, status: 'awaiting_restart' })
			expect(await generations.readState(generation)).toEqual(before)
			expect(await generations.readDesired()).toEqual(desiredBefore)
		}
	)
})
