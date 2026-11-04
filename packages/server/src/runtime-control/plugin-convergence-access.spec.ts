import { PluginRuntimeGenerationStore } from './plugin-runtime-generation.store'
import { createNode, FakeRedis, loadedPluginState } from './runtime-restart.test-fixture'

describe('organization plugin convergence access', () => {
	it('authorizes the original change independently of cumulative requirements', async () => {
		const redis = new FakeRedis()
		const generations = new PluginRuntimeGenerationStore(redis)
		const node = await createNode(redis, 'api-a', 'boot-a', loadedPluginState(), false)
		try {
			const foreign = await generations.publish({
				generation: 0,
				source: 'plugin-change',
				requirements: [{ scopeKey: 'org-b', pluginName: 'foreign', state: 'loaded' }]
			})
			const own = await generations.publish({
				generation: 0,
				source: 'plugin-change',
				requirements: [{ scopeKey: 'org-a', pluginName: 'own', state: 'loaded' }]
			})
			const mixed = await generations.publish({
				generation: 0,
				source: 'interactive',
				requirements: [
					{ scopeKey: 'org-a', pluginName: 'own', state: 'loaded' },
					{ scopeKey: 'org-b', pluginName: 'foreign', state: 'loaded' }
				]
			})
			await expect(node.coordinator.getPluginConvergenceStatus(own, 'org-a')).resolves.toMatchObject({
				generation: own
			})
			await expect(node.coordinator.getPluginConvergenceStatus(foreign, 'org-a')).resolves.toBeNull()
			await expect(node.coordinator.getPluginConvergenceStatus(mixed, 'org-a')).resolves.toBeNull()
			await expect(node.coordinator.getPluginConvergenceStatus(foreign)).resolves.toMatchObject({
				generation: foreign
			})
			redis.values.delete(`xpert:system:plugin-runtime:generation:${own}:change`)
			await expect(node.coordinator.getPluginConvergenceStatus(own, 'org-a')).resolves.toBeNull()
		} finally {
			await node.destroy()
		}
	})
})
