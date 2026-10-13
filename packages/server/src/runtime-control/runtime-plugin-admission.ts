/** A lost Redis lease closes traffic immediately; returning boots must revalidate desired plugin state. */
import type { InstanceRegistryService } from '../managed-connection/instance-registry.service'
import { admitPluginStartup, canRestorePluginStartup, isPluginStartupListening } from '../plugin/plugin-startup-state'
import type { RuntimeLifecycleService } from './runtime-lifecycle.service'
import type { PluginRuntimeGenerationStore } from './plugin-runtime-generation.store'
import { evaluateRuntimeRequirements } from './plugin-runtime-requirements'
import type { RolloutAdmission } from './runtime-rollout-policy'

export type RestartRegistry = Pick<
	InstanceRegistryService,
	'instanceId' | 'bootId' | 'getPluginState' | 'getReadyInstances' | 'isLeaseValid' | 'setReady'
>

export class RuntimePluginAdmission {
	private admitted = false
	private checkedUntil = 0
	private committed = false
	private readySince?: number
	constructor(
		private readonly registry: RestartRegistry,
		private readonly lifecycle: RuntimeLifecycleService
	) {
		lifecycle.setReadinessGuard(
			() =>
				isPluginStartupListening() && this.admitted && Date.now() < this.checkedUntil && registry.isLeaseValid()
		)
	}
	isStable(): boolean {
		return (
			this.lifecycle.readiness().status === 'ready' &&
			this.readySince !== undefined &&
			Date.now() - this.readySince >= 3_000
		)
	}
	async refresh(
		generations: Pick<PluginRuntimeGenerationStore, 'readDesired'>,
		rollout?: RolloutAdmission
	): Promise<void> {
		const desired = await generations.readDesired()
		const continuous = this.admitted && Date.now() < this.checkedUntil && this.registry.isLeaseValid()
		const state = this.registry.getPluginState()
		const matches =
			!!state && (!desired || evaluateRuntimeRequirements(desired.requirements, state).status === 'satisfied')
		// Only the active operation's replacement may join against its pinned full manifest.
		// Other new/returning boots still have to satisfy the latest desired generation.
		const matchesRollout =
			!!state &&
			!!rollout &&
			desired?.status === 'in_progress' &&
			desired.generation >= rollout.generation &&
			evaluateRuntimeRequirements(rollout.requirements, state).status === 'satisfied'
		// During a failed/in-progress rollout, keep existing healthy boots serving their previous version.
		// New/returning boots are fenced until current, or explicitly restored after a failed candidate.
		this.admitted =
			matches ||
			matchesRollout ||
			(!!desired &&
				desired.status !== 'completed' &&
				(continuous || (desired.status === 'failed' && canRestorePluginStartup(state))))
		this.checkedUntil = Date.now() + 5_000
		const ready =
			isPluginStartupListening() &&
			this.admitted &&
			this.registry.isLeaseValid() &&
			this.lifecycle.readiness().status !== 'draining'
		this.readySince = ready ? (continuous ? (this.readySince ?? Date.now()) : Date.now()) : undefined
		await this.registry.setReady(ready, this.checkedUntil)
		if (this.isStable() && !this.committed) {
			this.committed = admitPluginStartup(state)
		}
	}
}
