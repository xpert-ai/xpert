import type { PluginRuntimeGenerationStore } from './plugin-runtime-generation.store'
import type { RestartRegistry } from './runtime-plugin-admission'
import type { PluginGenerationChange } from './runtime-restart.types'
import { evaluateRuntimeRequirements, mergeRuntimeRequirements } from './plugin-runtime-requirements'

/** Leave an impossible single-replica rollout idle until the operator explicitly accepts an outage. */
export async function awaitPluginRestartApproval(
	changes: PluginGenerationChange[],
	registry: RestartRegistry,
	generations: PluginRuntimeGenerationStore
): Promise<boolean> {
	if (changes.every((change) => change.source === 'interactive' && change.allowDowntime === true)) return false
	const ready = await registry.getReadyInstances()
	if (ready.length !== 1 || ready[0].instanceId !== registry.instanceId) return false
	const requirements =
		(await generations.readRequirements(changes[changes.length - 1].generation)) ??
		mergeRuntimeRequirements(changes.flatMap((change) => change.requirements))
	if (evaluateRuntimeRequirements(requirements, registry.getPluginState()).status === 'satisfied') return false
	for (const change of changes) {
		await generations.writeState({ generation: change.generation, status: 'awaiting_restart' })
	}
	return true
}
