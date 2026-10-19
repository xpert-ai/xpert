/**
 * Invariants: waiting for capacity is retryable, not a terminal rollout outcome.
 * An unready observer cannot authorize restarting the last serving replica.
 * Only explicit operator approval permits a single-replica outage.
 */
import type { PluginRuntimeGenerationStore } from './plugin-runtime-generation.store'
import type { RestartRegistry } from './runtime-plugin-admission'
import type { PluginGenerationChange } from './runtime-restart.types'
import { evaluateRuntimeRequirements, mergeRuntimeRequirements } from './plugin-runtime-requirements'

/** Approval covers the published cumulative snapshot, never changes queued after it. */
export function hasPluginOutageApproval(changes: PluginGenerationChange[]): boolean {
	const latest = changes.at(-1)
	return latest?.source === 'interactive' && latest.allowDowntime === true
}

/** Recheck capacity while waiting; only the sole ready replica can prove no restart is needed. */
export async function awaitPluginRestartApproval(
	changes: PluginGenerationChange[],
	registry: RestartRegistry,
	generations: PluginRuntimeGenerationStore
): Promise<boolean> {
	if (hasPluginOutageApproval(changes)) return false
	const ready = await registry.getReadyInstances()
	if (ready.length > 1) return false
	// Let the sole ready replica evaluate its own loaded manifest; observers cannot prove it is current.
	if (ready.length === 0 || ready[0].instanceId !== registry.instanceId) return true
	const requirements =
		(await generations.readRequirements(changes[changes.length - 1].generation)) ??
		mergeRuntimeRequirements(changes.flatMap((change) => change.requirements))
	if (evaluateRuntimeRequirements(requirements, registry.getPluginState()).status === 'satisfied') return false
	for (const change of changes) {
		await generations.writeState({ generation: change.generation, status: 'awaiting_restart' })
	}
	return true
}
