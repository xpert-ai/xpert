/**
 * Invariants: replacement boots read shared configuration, which may already include queued updates.
 * Accept only an exact published cumulative manifest; never combine per-plugin versions or infer semver compatibility.
 * Keep the operation's snapshot, queued outcomes and outage consent unchanged.
 */
import type { RuntimePluginState } from '../managed-connection/instance-registry.service'
import type { PluginRuntimeGenerationStore } from './plugin-runtime-generation.store'
import { evaluateRuntimeRequirements } from './plugin-runtime-requirements'
import type { RolloutAdmission } from './runtime-rollout-policy'

export async function resolveRolloutAdmission(
	generations: Pick<PluginRuntimeGenerationStore, 'readRequirements'>,
	desired: Awaited<ReturnType<PluginRuntimeGenerationStore['readDesired']>>,
	rollout: RolloutAdmission | undefined,
	state: RuntimePluginState | null
): Promise<RolloutAdmission | undefined> {
	if (!rollout || !state || desired?.status !== 'in_progress' || desired.generation <= rollout.generation)
		return rollout

	if (evaluateRuntimeRequirements(desired.requirements, state).status === 'satisfied')
		return { generation: desired.generation, requirements: desired.requirements }
	if (evaluateRuntimeRequirements(rollout.requirements, state).status === 'satisfied') return rollout

	// Startup can observe an intermediate published manifest while a bulk update keeps advancing desired state.
	for (let generation = desired.generation - 1; generation > rollout.generation; generation--) {
		const requirements = await generations.readRequirements(generation)
		if (requirements && evaluateRuntimeRequirements(requirements, state).status === 'satisfied')
			return { generation, requirements }
	}
	// Preserve the original mismatch so an unrecognized boot fails the rollout with its exact version error.
	return rollout
}
