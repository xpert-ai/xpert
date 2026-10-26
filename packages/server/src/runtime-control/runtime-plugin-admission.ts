import type { IRuntimeAdmissionDiagnostics } from '@xpert-ai/contracts'
import { Logger } from '@nestjs/common'
/** A lost Redis lease closes traffic immediately; returning boots must revalidate desired plugin state. */
import type { InstanceRegistryService } from '../managed-connection/instance-registry.service'
import { admitPluginStartup, canRestorePluginStartup, isPluginStartupListening } from '../plugin/plugin-startup-state'
import type { RuntimeLifecycleService } from './runtime-lifecycle.service'
import type { PluginRuntimeGenerationStore } from './plugin-runtime-generation.store'
import { evaluateRuntimeRequirements } from './plugin-runtime-requirements'
import { resolveRolloutAdmission } from './plugin-rollout-admission'
import type { RolloutAdmission } from './runtime-rollout-policy'

export type RestartRegistry = Pick<
	InstanceRegistryService,
	'instanceId' | 'bootId' | 'getPluginState' | 'getReadyInstances' | 'isLeaseValid' | 'setReady'
> &
	Partial<Pick<InstanceRegistryService, 'getLeaseRemainingMs'>>

export class RuntimePluginAdmission {
	private readonly logger = new Logger(RuntimePluginAdmission.name)
	private lastMismatch?: string
	private admitted = false
	private checkedUntil = 0
	private committed = false
	private readySince?: number
	private lastCheckAt?: number
	private checkStartedAt?: number
	private checkDurationMs: number | null = null
	private lastCheckFailed = false
	private eventLoopDelayMaxMs?: number
	private eventLoopDelayP99Ms?: number
	constructor(
		private readonly registry: RestartRegistry,
		private readonly lifecycle: RuntimeLifecycleService
	) {
		lifecycle.setReadinessGuard(() => this.diagnostics().reason === 'ready')
		lifecycle.setAdmissionDiagnostics(() => this.diagnostics())
	}
	recordEventLoopDelay(maxMs: number, p99Ms: number): void {
		this.eventLoopDelayMaxMs = maxMs
		this.eventLoopDelayP99Ms = p99Ms
	}
	diagnostics(): IRuntimeAdmissionDiagnostics {
		const now = Date.now()
		return {
			reason: !isPluginStartupListening()
				? 'startup-not-listening'
				: !this.registry.isLeaseValid()
					? 'lease-expired'
					: now >= this.checkedUntil
						? 'validation-expired'
						: !this.admitted
							? 'plugin-not-admitted'
							: 'ready',
			validationAgeMs: this.lastCheckAt === undefined ? null : now - this.lastCheckAt,
			validationRemainingMs: Math.max(0, this.checkedUntil - now),
			leaseRemainingMs: this.registry.getLeaseRemainingMs?.(),
			checkDurationMs: this.checkStartedAt === undefined ? this.checkDurationMs : now - this.checkStartedAt,
			checkInFlight: this.checkStartedAt !== undefined,
			lastCheckFailed: this.lastCheckFailed,
			eventLoopDelayMaxMs: this.eventLoopDelayMaxMs,
			eventLoopDelayP99Ms: this.eventLoopDelayP99Ms
		}
	}
	isStable(): boolean {
		return (
			this.lifecycle.readiness().status === 'ready' &&
			this.readySince !== undefined &&
			Date.now() - this.readySince >= 3_000
		)
	}
	async refresh(
		generations: Pick<PluginRuntimeGenerationStore, 'readDesired' | 'readRequirements'>,
		rollout?: RolloutAdmission | (() => Promise<RolloutAdmission | undefined>)
	): Promise<{ manifest?: RolloutAdmission; desiredGeneration: number }> {
		this.checkStartedAt = Date.now()
		try {
			const result = await this.validate(generations, typeof rollout === 'function' ? await rollout() : rollout)
			this.lastCheckFailed = false
			return result
		} catch (error) {
			this.lastCheckFailed = true
			throw error
		} finally {
			this.checkDurationMs = Date.now() - this.checkStartedAt
			this.checkStartedAt = undefined
			this.lifecycle.readiness()
		}
	}
	private async validate(
		generations: Pick<PluginRuntimeGenerationStore, 'readDesired' | 'readRequirements'>,
		rollout?: RolloutAdmission
	): Promise<{ manifest?: RolloutAdmission; desiredGeneration: number }> {
		const desired = await generations.readDesired()
		const state = this.registry.getPluginState()
		const admission = await resolveRolloutAdmission(generations, desired, rollout, state)
		const continuous = this.admitted && Date.now() < this.checkedUntil && this.registry.isLeaseValid()
		const evaluation = desired ? evaluateRuntimeRequirements(desired.requirements, state) : undefined
		const matches = !!state && (!desired || evaluation?.status === 'satisfied')
		// Report only changed metadata mismatches, never plugin configuration or credentials.
		// A generic readiness 503 alone cannot tell an operator which installation needs repair.
		const mismatch = evaluation?.status === 'failed' ? evaluation.error : undefined
		if (mismatch && mismatch !== this.lastMismatch) this.logger.warn(mismatch)
		this.lastMismatch = mismatch
		// Only the active operation's replacement may join against a verified rollout manifest.
		// Other new/returning boots still have to satisfy the latest desired generation.
		const matchesRollout =
			!!state &&
			!!admission &&
			desired?.status === 'in_progress' &&
			desired.generation >= admission.generation &&
			evaluateRuntimeRequirements(admission.requirements, state).status === 'satisfied'
		// During a failed/in-progress rollout, keep existing healthy boots serving their previous version.
		// New/returning boots are fenced until current, or explicitly restored after a failed candidate.
		this.admitted =
			matches ||
			matchesRollout ||
			(!!desired &&
				desired.status !== 'completed' &&
				(continuous || (desired.status === 'failed' && canRestorePluginStartup(state))))
		this.lastCheckAt = Date.now()
		this.checkedUntil = this.lastCheckAt + 5_000
		const ready =
			isPluginStartupListening() &&
			this.admitted &&
			this.registry.isLeaseValid() &&
			this.lifecycle.readiness().status === 'ready'
		this.readySince = ready ? (continuous ? (this.readySince ?? Date.now()) : Date.now()) : undefined
		await this.registry.setReady(ready, this.checkedUntil)
		if (this.isStable() && !this.committed) {
			this.committed = admitPluginStartup(state)
		}
		return { manifest: admission, desiredGeneration: desired?.generation ?? 0 }
	}
}
