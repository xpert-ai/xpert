import type { IRuntimePluginRequirement } from '@xpert-ai/contracts'
import type { RuntimePluginState } from '../managed-connection/instance-registry.service'

export function evaluateRuntimeRequirements(
	requirements: IRuntimePluginRequirement[],
	state: RuntimePluginState | null
): { status: 'waiting' | 'satisfied' } | { status: 'failed'; error: string } {
	if (!requirements.length) return { status: 'satisfied' }
	if (!state) return { status: 'waiting' }
	for (const requirement of requirements) {
		const failure = findRuntimeFailure(state, requirement)
		const plugin = findRuntimePlugin(state, requirement)
		if (requirement.state === 'absent') {
			if (plugin || failure) {
				return {
					status: 'failed',
					error: `Plugin ${requirement.pluginName} is still present in ${requirement.scopeKey}`
				}
			}
			continue
		}
		if (failure) return { status: 'failed', error: failure.error }
		if (!plugin) {
			return {
				status: 'failed',
				error: `Plugin ${requirement.pluginName} was not loaded in ${requirement.scopeKey}`
			}
		}
		if (requirement.version && plugin.version !== requirement.version) {
			return {
				status: 'failed',
				error: `Plugin ${requirement.pluginName} loaded ${plugin.version ?? 'unknown'} instead of ${requirement.version}`
			}
		}
		if (requirement.runtimeRevision && plugin.runtimeRevision !== requirement.runtimeRevision) {
			return {
				status: 'failed',
				error: `Plugin ${requirement.pluginName} loaded runtime revision ${plugin.runtimeRevision ?? 'unknown'} instead of ${requirement.runtimeRevision}`
			}
		}
	}
	return { status: 'satisfied' }
}

function findRuntimePlugin(state: RuntimePluginState, requirement: IRuntimePluginRequirement) {
	return state.plugins.find(
		(plugin) =>
			plugin.scopeKey === requirement.scopeKey &&
			(plugin.pluginName === requirement.pluginName || plugin.packageName === requirement.pluginName)
	)
}

function findRuntimeFailure(state: RuntimePluginState, requirement: IRuntimePluginRequirement) {
	return state.failures.find(
		(failure) =>
			failure.scopeKey === requirement.scopeKey &&
			(failure.pluginName === requirement.pluginName || failure.packageName === requirement.pluginName)
	)
}

export function mergeRuntimeRequirements(requirements: IRuntimePluginRequirement[]): IRuntimePluginRequirement[] {
	const merged = new Map<string, IRuntimePluginRequirement>()
	for (const requirement of requirements) {
		merged.set(`${requirement.scopeKey}\u0000${requirement.pluginName}`, requirement)
	}
	return Array.from(merged.values())
}
