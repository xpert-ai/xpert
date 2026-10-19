import { awaitPluginRestartApproval } from './plugin-convergence-capacity'
/**
 * Invariants:
 * - Only live, ready boots join a rollout; historical members remain available for audit.
 * - A process already satisfying every runtime requirement acknowledges without restarting.
 * - One candidate drains at a time; the last healthy replica needs explicit operator outage consent.
 * - Replacement admission and completion use the same published manifest; queued changes retain their follow-up rollout.
 */
import {
	REPLICA_RESTART_TIMEOUT_MS,
	operationDeadlineAt,
	operationDeadlineError,
	operationStateTtlSeconds,
	restartStatus
} from './runtime-restart-deadlines'
import { RuntimePluginAdmission, RestartRegistry } from './runtime-plugin-admission'
import { createRestartMetadata, INITIAL_OPERATION_TTL_MS, replacementAdmission } from './runtime-rollout-policy'
import { preparePluginStartupRetry, getPluginStartupFailure } from '../plugin/plugin-startup-state'
import {
	IPluginRuntimeConvergenceStatus,
	IRuntimePluginRequirement,
	IRuntimeRestartResponse,
	IRuntimeRestartStatus,
	RuntimeRestartStatus
} from '@xpert-ai/contracts'
import {
	ConflictException,
	Inject,
	Injectable,
	Logger,
	OnModuleDestroy,
	OnModuleInit,
	OnApplicationBootstrap,
	ServiceUnavailableException
} from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { REDIS_CLIENT } from '../core/redis/types'
import { InstanceRegistryService } from '../managed-connection/instance-registry.service'
import { PluginRuntimeGenerationStore, PLUGIN_GENERATION_KEY } from './plugin-runtime-generation.store'
import type {
	RuntimeRestartRedisClient,
	RuntimeRestartRedisSubscriber,
	RestartOperationMetadata,
	RestartTargetState,
	PluginRuntimeChangeInput,
	PluginRuntimeChangeResult,
	RestartOperationInput
} from './runtime-restart.types'
import { RUNTIME_PROCESS_SIGNALER, RuntimeProcessSignaler } from './runtime-process-signaler'
import { closeRedisSubscriber } from './shutdown-step'
import { RuntimeRestartTargetStore } from './runtime-restart-target.store'
import { evaluateRuntimeRequirements, mergeRuntimeRequirements } from './plugin-runtime-requirements'
import { RuntimeLifecycleService } from './runtime-lifecycle.service'

export type { PluginRuntimeChangeInput, PluginRuntimeChangeResult } from './runtime-restart.types'

const ACTIVE_RESTART_KEY = 'xpert:system:runtime:restart:active'
const RESTART_CHANNEL = 'xpert:system:runtime:restart:events'
const DEFAULT_SIGNAL_DELAY_MS = 750
const DEFAULT_DRAIN_TIMEOUT_MS = 30_000
const PENDING_TARGET_TIMEOUT_MS = 45_000
const ACTIVE_RESTART_EXPIRY_GRACE_MS = 30_000
const COORDINATOR_POLL_MS = 1_000
const RELEASE_LOCK_SCRIPT = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0
`
const EXTEND_LOCK_SCRIPT = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('pexpire', KEYS[1], tonumber(ARGV[2]))
end
return 0
`
const TRANSITION_ACTIVE_RESTART_SCRIPT = `
if redis.call('get', KEYS[1]) ~= ARGV[1] then
  return -1
end
local generation = tonumber(redis.call('get', KEYS[2]) or '0')
if generation ~= tonumber(ARGV[2]) then
  return 0
end
if ARGV[3] == '' then
  return redis.call('del', KEYS[1])
end
redis.call('psetex', KEYS[1], tonumber(ARGV[4]), ARGV[3])
return 1
`

@Injectable()
export class RuntimeRestartCoordinatorService implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy {
	private readonly logger = new Logger(RuntimeRestartCoordinatorService.name)
	private readonly signalDelayMs = DEFAULT_SIGNAL_DELAY_MS
	private readonly drainTimeoutMs = DEFAULT_DRAIN_TIMEOUT_MS
	private subscriber?: RuntimeRestartRedisSubscriber
	private pollTimer?: ReturnType<typeof setInterval>
	private processing = false
	private bootstrapped = false
	private readonly generations: PluginRuntimeGenerationStore
	private readonly targets: RuntimeRestartTargetStore
	private readonly admission: RuntimePluginAdmission

	constructor(
		@Inject(REDIS_CLIENT)
		private readonly redis: RuntimeRestartRedisClient,
		@Inject(RUNTIME_PROCESS_SIGNALER)
		private readonly processSignaler: RuntimeProcessSignaler,
		private readonly lifecycle: RuntimeLifecycleService,
		@Inject(InstanceRegistryService)
		private readonly instanceRegistry: RestartRegistry
	) {
		this.generations = new PluginRuntimeGenerationStore(redis)
		this.targets = new RuntimeRestartTargetStore(redis)
		this.admission = new RuntimePluginAdmission(instanceRegistry, lifecycle)
	}

	async onModuleInit(): Promise<void> {
		await this.startSubscriber()
	}

	onApplicationBootstrap(): void {
		this.bootstrapped = true
		this.pollTimer = setInterval(() => void this.processActiveRestart(), COORDINATOR_POLL_MS)
		this.pollTimer.unref?.()
		void this.processActiveRestart()
	}

	async onModuleDestroy(): Promise<void> {
		this.bootstrapped = false
		if (this.pollTimer) {
			clearInterval(this.pollTimer)
			this.pollTimer = undefined
		}
		await closeRedisSubscriber('restart-coordinator.redis', this.subscriber)
		this.subscriber = undefined
	}

	async requestRestart(input: {
		allowDowntime?: boolean
		reason?: string
		source: RestartOperationMetadata['source']
		actorUserId?: string
		tenantId?: string
		sourceIp?: string
		runtimeRequirements?: IRuntimePluginRequirement[]
	}): Promise<IRuntimeRestartResponse> {
		const runtimeRequirements = mergeRuntimeRequirements(input.runtimeRequirements ?? [])
		if (runtimeRequirements.length) {
			const generation = await this.generations.publish({
				generation: 0,
				requirements: runtimeRequirements,
				source: 'interactive',
				allowDowntime: input.source === 'interactive' && input.allowDowntime === true,
				reason: input.reason,
				actorUserId: input.actorUserId,
				tenantId: input.tenantId,
				sourceIp: input.sourceIp
			})
			this.writeAuditLog('runtime.restart.queued', {
				generation,
				reason: input.reason,
				actorUserId: input.actorUserId,
				tenantId: input.tenantId,
				sourceIp: input.sourceIp,
				runtimeRequirements
			})
			await this.publish('plugin-generation-changed')
			const restart = await this.ensurePendingPluginOperation()
			if (!restart) {
				throw new ServiceUnavailableException({
					statusCode: 503,
					errorCode: 'RUNTIME_RESTART_COORDINATION_UNAVAILABLE',
					message: 'Runtime restart coordination is unavailable'
				})
			}
			return { ...restart, pluginGeneration: generation }
		}

		const activeRestartId = await this.redis.get(ACTIVE_RESTART_KEY)
		if (activeRestartId) {
			throw this.restartInProgress(activeRestartId)
		}
		const pendingPluginChanges = await this.generations.readPending()
		const pluginGeneration = pendingPluginChanges.at(-1)?.generation ?? (await this.generations.current())

		return await this.startOperation({
			reason: input.reason,
			source: input.source,
			allowDowntime: input.allowDowntime,
			actorUserId: input.actorUserId,
			tenantId: input.tenantId,
			sourceIp: input.sourceIp,
			pluginGeneration,
			pluginChanges: pendingPluginChanges,
			runtimeRequirements: []
		})
	}

	async recordPluginChange(input: PluginRuntimeChangeInput): Promise<PluginRuntimeChangeResult> {
		return this.recordPluginRequirements(
			[
				{
					scopeKey: input.scopeKey,
					pluginName: input.pluginName,
					...(input.version ? { version: input.version } : {}),
					...(input.runtimeRevision ? { runtimeRevision: input.runtimeRevision } : {}),
					state: 'loaded'
				}
			],
			`Activate ${input.pluginName}@${input.version ?? 'latest'} in ${input.scopeKey}`
		)
	}

	async recordPluginRequirements(
		requirements: IRuntimePluginRequirement[],
		reason: string
	): Promise<PluginRuntimeChangeResult> {
		let generation: number
		try {
			generation = await this.generations.publish({
				generation: 0,
				requirements: mergeRuntimeRequirements(requirements),
				source: 'plugin-change',
				reason
			})
		} catch (error) {
			const message = this.describeError(error)
			this.logger.error(`Failed to publish plugin runtime convergence: ${message}`)
			return { scheduled: false, generation: 0 }
		}

		await this.publish('plugin-generation-changed')
		await this.ensurePendingPluginOperation().catch((error) => {
			this.logger.warn(
				`Plugin runtime generation ${generation} is durable but its rollout has not started yet: ${this.describeError(error)}`
			)
		})
		return { scheduled: true, generation }
	}

	async getStatus(restartId: string): Promise<IRuntimeRestartStatus | null> {
		const metadata = await this.readMetadata(restartId)
		if (!metadata) {
			return null
		}
		const targets = await this.targets.read(restartId)
		return restartStatus(metadata, targets)
	}

	async getPluginConvergenceStatus(generation: number): Promise<IPluginRuntimeConvergenceStatus | null> {
		const state = await this.generations.readState(generation)
		if (!state) {
			return null
		}
		const restart = state.restartId ? await this.getStatus(state.restartId) : null
		const status = state.status === 'in_progress' && restart?.status === 'failed' ? 'failed' : state.status
		return {
			generation,
			status,
			...(state.restartId ? { restartId: state.restartId } : {}),
			targetReplicaCount: restart?.targetReplicaCount ?? 0,
			completedReplicaCount: restart?.completedReplicaCount ?? 0,
			failedReplicaCount: restart?.failedReplicaCount ?? (status === 'failed' ? 1 : 0),
			...(state.error || restart?.error ? { error: state.error ?? restart?.error } : {})
		}
	}

	private async startOperation(input: RestartOperationInput): Promise<IRuntimeRestartResponse> {
		const metadata = await this.prepareOperation(input)
		const { restartId } = metadata
		await this.writeMetadata(metadata)
		const claimed =
			input.source === 'plugin-catch-up'
				? await this.generations.claimCatchUp(input.pluginGeneration, restartId, INITIAL_OPERATION_TTL_MS)
				: (await this.redis.set(ACTIVE_RESTART_KEY, restartId, { NX: true, PX: INITIAL_OPERATION_TTL_MS })) ===
					'OK'
		if (!claimed) {
			throw this.restartInProgress((await this.redis.get(ACTIVE_RESTART_KEY)) ?? undefined)
		}

		try {
			await this.activateOperation(metadata)

			return this.operationResponse(metadata)
		} catch (error) {
			await this.releaseLock(ACTIVE_RESTART_KEY, restartId)
			if (error instanceof ConflictException) {
				throw error
			}
			throw new ServiceUnavailableException({
				statusCode: 503,
				errorCode: 'RUNTIME_RESTART_COORDINATION_UNAVAILABLE',
				message: 'Runtime restart coordination is unavailable'
			})
		}
	}

	private async prepareOperation(input: RestartOperationInput): Promise<RestartOperationMetadata> {
		const restartId = randomUUID()
		const requestedAt = new Date().toISOString()
		const members = await this.instanceRegistry.getReadyInstances()
		const participants = new Map(members.map((member) => [member.instanceId, member]))
		if (input.source === 'plugin-catch-up')
			participants.set(this.instanceRegistry.instanceId, this.instanceRegistry)
		if (!participants.size) throw new Error('No healthy runtime replicas available')
		const metadata = createRestartMetadata(
			input,
			restartId,
			requestedAt,
			participants.size,
			await this.generations.readRequirements(input.pluginGeneration)
		)
		for (const member of participants.values()) {
			await this.targets.initialize(restartId, {
				replicaId: member.instanceId,
				expectedBootId: member.bootId,
				status: 'pending',
				updatedAt: requestedAt
			})
		}
		await this.redis.expire(this.targets.key(restartId), operationStateTtlSeconds(metadata))
		return metadata
	}

	private async activateOperation(metadata: RestartOperationMetadata): Promise<void> {
		this.writeAuditLog('runtime.restart.requested', {
			restartId: metadata.restartId,
			requestedAt: metadata.requestedAt,
			source: metadata.source,
			reason: metadata.reason,
			actorUserId: metadata.actorUserId,
			tenantId: metadata.tenantId,
			sourceIp: metadata.sourceIp,
			pluginGeneration: metadata.pluginGeneration,
			runtimeRequirements: metadata.runtimeRequirements,
			allowDowntime: metadata.allowDowntime === true
		})
		for (const generation of metadata.pluginGenerations) {
			await this.generations.writeState({
				generation,
				status: 'in_progress',
				restartId: metadata.restartId
			})
		}
		metadata.targetReplicaCount = Math.max(
			metadata.targetReplicaCount,
			(await this.targets.read(metadata.restartId)).length
		)
		metadata.maxConcurrentRestarts = 1
		metadata.deadlineAt = operationDeadlineAt(metadata.targetReplicaCount, metadata.maxConcurrentRestarts)
		metadata.phase = 'rolling'
		metadata.preparing = false
		await this.extendActiveRestart(metadata)
		await this.redis.expire(this.targets.key(metadata.restartId), operationStateTtlSeconds(metadata))
		await this.writeMetadata(metadata)
		await this.publish(metadata.restartId)
		void this.processActiveRestart()
	}

	private operationResponse(metadata: RestartOperationMetadata): IRuntimeRestartResponse {
		return {
			accepted: true,
			restartId: metadata.restartId,
			mode: 'rolling-self-signal',
			instanceId: this.lifecycle.instanceId,
			requestedAt: metadata.requestedAt,
			signalAfterMs: this.signalDelayMs,
			drainTimeoutMs: this.drainTimeoutMs
		}
	}

	private async processActiveRestart(): Promise<void> {
		if (this.processing || !this.bootstrapped) return
		this.processing = true
		try {
			const restartId = await this.redis.get(ACTIVE_RESTART_KEY)
			let metadata = restartId ? await this.readMetadata(restartId) : null
			let targets = metadata ? await this.targets.read(metadata.restartId) : []
			const admissionCheck = await this.admission.refresh(
				this.generations,
				replacementAdmission(metadata, targets, this.instanceRegistry.instanceId, this.instanceRegistry.bootId)
			)
			if (!restartId) {
				if (!(await this.ensurePendingPluginOperation())) await this.reconcileLocalPlugins()
				return
			}
			if (!metadata) {
				await this.releaseLock(ACTIVE_RESTART_KEY, restartId)
				return
			}

			if (metadata.preparing) {
				const error = operationDeadlineError(metadata)
				if (error) await this.finishOperation(metadata, 'failed', error)
				return
			}
			if (metadata.phase === 'collecting') {
				metadata = await this.finalizeRegistration(metadata)
				if (metadata.phase === 'collecting') return
			}

			targets = await this.targets.read(restartId)
			if (targets.length > metadata.targetReplicaCount) metadata = await this.finalizeRegistration(metadata)
			let ownTarget = targets.find((target) => target.replicaId === this.instanceRegistry.instanceId)
			if (ownTarget?.status === 'pending' && ownTarget.expectedBootId === this.instanceRegistry.bootId) {
				const refreshed = {
					...ownTarget,
					observedBootId: this.instanceRegistry.bootId,
					updatedAt: new Date().toISOString()
				}
				if (!(await this.targets.update(restartId, ownTarget, refreshed))) return
				ownTarget = refreshed
				targets = await this.targets.read(restartId)
			}

			const stalePending = targets.find(
				(target) =>
					target.status === 'pending' &&
					Date.now() - new Date(target.updatedAt).getTime() > PENDING_TARGET_TIMEOUT_MS
			)
			if (stalePending) {
				const failed = await this.failTarget(
					restartId,
					stalePending,
					`Replica ${stalePending.replicaId} disappeared before restart`
				)
				if (failed) await this.finishOperation(metadata, 'failed')
				return
			}
			const timedOut = targets.find(
				(target) =>
					target.status === 'restarting' &&
					target.startedAt &&
					Date.now() - new Date(target.startedAt).getTime() > REPLICA_RESTART_TIMEOUT_MS
			)
			if (timedOut) {
				const failed = await this.failTarget(
					restartId,
					timedOut,
					`Replica ${timedOut.replicaId} did not return after restart`
				)
				if (failed) await this.finishOperation(metadata, 'failed')
				return
			}
			if (targets.some((target) => target.status === 'failed')) {
				await this.finishOperation(metadata, 'failed')
				return
			}
			if (
				targets.length === metadata.targetReplicaCount &&
				targets.every((target) => target.status === 'completed')
			) {
				await this.finishOperation(metadata, 'completed')
				return
			}
			const deadlineError = operationDeadlineError(metadata)
			if (deadlineError) {
				const unfinished = targets.find((target) => target.status !== 'completed')
				if (unfinished) {
					await this.failTarget(restartId, unfinished, deadlineError)
				}
				await this.finishOperation(metadata, 'failed', deadlineError)
				return
			}
			if (!ownTarget || ownTarget.status === 'completed' || ownTarget.status === 'failed') return

			if (ownTarget.expectedBootId !== this.instanceRegistry.bootId) {
				const startupFailure = getPluginStartupFailure()
				if (startupFailure) {
					if (
						await this.failTarget(
							restartId,
							ownTarget,
							`${startupFailure.code}: ${startupFailure.pluginName} (${startupFailure.stage})`
						)
					)
						await this.finishOperation(metadata, 'failed')
					return
				}
				const result = evaluateRuntimeRequirements(
					admissionCheck.manifest?.requirements ??
						metadata.admissionRequirements ??
						metadata.runtimeRequirements,
					this.instanceRegistry.getPluginState()
				)
				if (result.status === 'waiting') return
				if (result.status === 'failed') {
					const failed = await this.failTarget(
						restartId,
						ownTarget,
						result.error,
						admissionCheck.desiredGeneration
					)
					if (failed) await this.finishOperation(metadata, 'failed')
					return
				}
				if (!this.admission.isStable()) return
				await this.completeTarget(restartId, ownTarget, 'replacement-ready')
				return
			}

			if (ownTarget.status === 'restarting') return
			if (metadata.runtimeRequirements.length) {
				const result = evaluateRuntimeRequirements(
					metadata.runtimeRequirements,
					this.instanceRegistry.getPluginState()
				)
				if (result.status === 'waiting') return
				if (result.status === 'satisfied') {
					await this.completeTarget(restartId, ownTarget, 'already-current')
					return
				}
			}
			if (targets.some((target) => target.status === 'pending' && !target.observedBootId)) return
			await this.beginReplicaRestart(metadata, ownTarget)
		} catch (error) {
			this.logger.warn(`Runtime restart coordination tick failed: ${this.describeError(error)}`)
		} finally {
			this.processing = false
		}
	}

	private async finalizeRegistration(metadata: RestartOperationMetadata): Promise<RestartOperationMetadata> {
		const token = `${metadata.restartId}:${this.instanceRegistry.instanceId}:${randomUUID()}`
		const claimed = await this.redis.set(this.registrationKey(metadata.restartId), token, { NX: true, PX: 5_000 })
		if (claimed !== 'OK') return (await this.readMetadata(metadata.restartId)) ?? metadata
		try {
			const current = await this.readMetadata(metadata.restartId)
			if (!current) return metadata
			// Upgrade a rollout created by the previous coordinator without dropping registered targets.
			const registered = await this.targets.read(metadata.restartId)
			for (const member of current.phase === 'collecting'
				? await this.instanceRegistry.getReadyInstances()
				: []) {
				if (!registered.some((target) => target.replicaId === member.instanceId)) {
					await this.targets.initialize(metadata.restartId, {
						replicaId: member.instanceId,
						expectedBootId: member.bootId,
						status: 'pending',
						updatedAt: new Date().toISOString()
					})
				}
			}
			const targets = await this.targets.read(metadata.restartId)
			const targetReplicaCount = Math.max(current.targetReplicaCount, targets.length)
			const maxConcurrentRestarts = 1
			const rolling: RestartOperationMetadata = {
				...current,
				phase: 'rolling',
				targetReplicaCount,
				maxConcurrentRestarts,
				deadlineAt: operationDeadlineAt(targetReplicaCount, maxConcurrentRestarts)
			}
			await this.extendActiveRestart(rolling)
			await this.redis.expire(this.targets.key(rolling.restartId), operationStateTtlSeconds(rolling))
			await this.writeMetadata(rolling)
			this.writeAuditLog('runtime.restart.participants-registered', {
				restartId: metadata.restartId,
				targetReplicas: targets.map((target) => target.replicaId),
				maxConcurrentRestarts: rolling.maxConcurrentRestarts
			})
			await this.publish(metadata.restartId)
			return rolling
		} finally {
			await this.releaseLock(this.registrationKey(metadata.restartId), token)
		}
	}

	private async beginReplicaRestart(metadata: RestartOperationMetadata, target: RestartTargetState): Promise<void> {
		if (this.lifecycle.readiness().status === 'ready' && !this.admission.isStable()) return
		const lockToken = `${metadata.restartId}:${target.replicaId}:${this.instanceRegistry.bootId}:${randomUUID()}`
		const restartSlot = await this.claimRestartSlot(metadata, lockToken)
		if (restartSlot === null) return

		const healthy = await this.instanceRegistry.getReadyInstances()
		const hasCapacity =
			metadata.allowDowntime === true || healthy.some((item) => item.instanceId !== target.replicaId)
		const currentTargets = await this.targets.read(metadata.restartId)
		const current = currentTargets.find((item) => item.replicaId === target.replicaId)
		if (
			!hasCapacity ||
			!current ||
			current.status !== 'pending' ||
			current.expectedBootId !== this.instanceRegistry.bootId ||
			currentTargets.some((item) => item.status === 'failed' || item.status === 'restarting')
		) {
			await this.releaseRestartSlot(metadata.restartId, restartSlot, lockToken)
			return
		}

		preparePluginStartupRetry()
		const startedAt = new Date().toISOString()
		const restarting: RestartTargetState = {
			...current,
			status: 'restarting',
			startedAt,
			updatedAt: startedAt,
			lockToken,
			restartSlot
		}
		if (!(await this.targets.update(metadata.restartId, current, restarting, metadata.pluginGeneration))) {
			await this.releaseRestartSlot(metadata.restartId, restartSlot, lockToken)
			return
		}
		if (!this.lifecycle.beginDrain({ restartId: metadata.restartId, requestedAt: metadata.requestedAt })) {
			await this.targets.update(metadata.restartId, restarting, {
				...current,
				updatedAt: new Date().toISOString()
			})
			await this.releaseRestartSlot(metadata.restartId, restartSlot, lockToken)
			return
		}

		this.writeAuditLog('runtime.restart.replica-draining', {
			restartId: metadata.restartId,
			replicaId: target.replicaId,
			bootId: this.instanceRegistry.bootId
		})
		await this.instanceRegistry.setReady(false)
		const timer = setTimeout(() => void this.terminateAfterDrain(metadata, restarting), this.signalDelayMs)
		timer.unref?.()
	}

	private async terminateAfterDrain(metadata: RestartOperationMetadata, target: RestartTargetState): Promise<void> {
		try {
			// This rolling-restart grace precedes the process watchdog, which starts only when SIGTERM is received.
			const drained = await this.lifecycle.waitForIdle(this.drainTimeoutMs)
			if (
				(await this.redis.get(ACTIVE_RESTART_KEY)) !== metadata.restartId ||
				(await this.targets.read(metadata.restartId)).some((item) => item.status === 'failed')
			) {
				this.lifecycle.cancelDrain(metadata.restartId)
				return
			}
			if (
				metadata.allowDowntime !== true &&
				!(await this.instanceRegistry.getReadyInstances()).some((item) => item.instanceId !== target.replicaId)
			) {
				throw new Error('No healthy peer remains before candidate restart')
			}
			this.writeAuditLog('runtime.restart.replica-signaling', {
				restartId: metadata.restartId,
				replicaId: target.replicaId,
				bootId: this.instanceRegistry.bootId,
				drained,
				activeRequests: this.lifecycle.readiness().activeRequests,
				signal: 'SIGTERM'
			})
			this.processSignaler.signal('SIGTERM')
		} catch (error) {
			this.lifecycle.cancelDrain(metadata.restartId)
			try {
				const failed = await this.failTarget(metadata.restartId, target, this.describeError(error))
				if (failed) await this.finishOperation(metadata, 'failed')
			} catch {
				this.logger.warn('Runtime restart aborted; failed to persist candidate failure')
			}
		}
	}

	private async completeTarget(
		restartId: string,
		target: RestartTargetState,
		reason: 'already-current' | 'replacement-ready'
	): Promise<void> {
		const updated = await this.targets.update(restartId, target, {
			...target,
			status: 'completed',
			acknowledgedBootId: this.instanceRegistry.bootId,
			updatedAt: new Date().toISOString()
		})
		if (!updated) return
		await this.releaseTargetRestartSlot(restartId, target)
		this.writeAuditLog('runtime.restart.replica-ready', {
			restartId,
			replicaId: target.replicaId,
			previousBootId: target.expectedBootId,
			bootId: this.instanceRegistry.bootId,
			reason
		})
		await this.publish(restartId)
		void this.processActiveRestart()
	}

	private async failTarget(
		restartId: string,
		target: RestartTargetState,
		error: string,
		expectedGeneration?: number
	): Promise<boolean> {
		const updated = await this.targets.fail(restartId, target, error, expectedGeneration)
		if (updated) await this.releaseTargetRestartSlot(restartId, target)
		return updated
	}

	private async finishOperation(
		metadata: RestartOperationMetadata,
		status: Extract<RuntimeRestartStatus, 'completed' | 'failed'>,
		operationError?: string
	): Promise<void> {
		const targets = await this.targets.read(metadata.restartId)
		const error = operationError ?? targets.find((target) => target.status === 'failed')?.error
		for (const generation of metadata.pluginGenerations) {
			await this.generations.writeState({
				generation,
				status,
				restartId: metadata.restartId,
				...(error ? { error } : {})
			})
		}

		let handoffPending = true
		while (handoffPending) {
			const currentGeneration = await this.generations.current()
			if (status === 'failed') {
				for (
					let generation = metadata.pluginGeneration + 1;
					metadata.source !== 'plugin-catch-up' && generation <= currentGeneration;
					generation += 1
				) {
					await this.generations.writeState({
						generation,
						status: 'failed',
						error: error ?? 'A previous plugin convergence rollout failed'
					})
				}
				const transition = await this.transitionActiveRestart(metadata.restartId, currentGeneration)
				if (transition === 'generation-changed') continue
				if (transition === 'lost') return
				handoffPending = false
				continue
			}

			if (currentGeneration > metadata.pluginGeneration) {
				const changes = await this.generations.readChanges(metadata.pluginGeneration + 1, currentGeneration)
				const followUp = await this.prepareOperation({
					reason: `Converge plugin runtime generation ${currentGeneration}`,
					source: 'plugin-follow-up',
					pluginGeneration: currentGeneration,
					pluginChanges: changes,
					runtimeRequirements: []
				})
				await this.writeMetadata(followUp)
				const transition = await this.transitionActiveRestart(
					metadata.restartId,
					currentGeneration,
					followUp.restartId
				)
				if (transition === 'generation-changed') continue
				if (transition === 'lost') return
				this.writeOperationFinishedAudit(metadata, status, error)
				await this.activateOperation(followUp)
				return
			}

			const transition = await this.transitionActiveRestart(metadata.restartId, currentGeneration)
			if (transition === 'generation-changed') continue
			if (transition === 'lost') return
			handoffPending = false
		}

		this.writeOperationFinishedAudit(metadata, status, error)
	}

	private writeOperationFinishedAudit(
		metadata: RestartOperationMetadata,
		status: Extract<RuntimeRestartStatus, 'completed' | 'failed'>,
		error?: string
	): void {
		this.writeAuditLog(`runtime.restart.${status}`, {
			restartId: metadata.restartId,
			pluginGeneration: metadata.pluginGeneration,
			targetReplicaCount: metadata.targetReplicaCount,
			...(error ? { error } : {})
		})
	}

	private async transitionActiveRestart(
		restartId: string,
		expectedPluginGeneration: number,
		nextRestartId?: string
	): Promise<'transitioned' | 'generation-changed' | 'lost'> {
		if (!this.redis.eval) {
			throw new Error('Redis scripting is required for atomic runtime restart handoff')
		}
		const result = Number(
			await this.redis.eval(TRANSITION_ACTIVE_RESTART_SCRIPT, {
				keys: [ACTIVE_RESTART_KEY, PLUGIN_GENERATION_KEY],
				arguments: [
					restartId,
					`${expectedPluginGeneration}`,
					nextRestartId ?? '',
					`${INITIAL_OPERATION_TTL_MS}`
				]
			})
		)
		if (result === 1) return 'transitioned'
		if (result === 0) return 'generation-changed'
		return 'lost'
	}

	private async startSubscriber(): Promise<void> {
		if (!this.redis.duplicate) {
			this.logger.warn('Redis Pub/Sub is unavailable; runtime restart coordination will use polling only.')
			return
		}
		try {
			this.subscriber = this.redis.duplicate()
			await this.subscriber.connect?.()
			await this.subscriber.subscribe?.(RESTART_CHANNEL, () => void this.processActiveRestart())
		} catch (error) {
			this.logger.warn(`Failed to subscribe to runtime restart events: ${this.describeError(error)}`)
			await this.subscriber?.quit?.().catch(() => undefined)
			this.subscriber = undefined
		}
	}

	private async publish(message: string): Promise<void> {
		await this.redis.publish?.(RESTART_CHANNEL, message).catch((error) => {
			this.logger.warn(`Failed to publish runtime restart event: ${this.describeError(error)}`)
		})
	}

	private async ensurePendingPluginOperation(): Promise<IRuntimeRestartResponse | null> {
		const activeRestartId = await this.redis.get(ACTIVE_RESTART_KEY)
		if (activeRestartId) {
			return await this.readOperationResponse(activeRestartId)
		}

		const changes = await this.generations.readPending()
		if (!changes.length) return null
		if (await awaitPluginRestartApproval(changes, this.instanceRegistry, this.generations)) return null

		const latest = changes[changes.length - 1]
		try {
			return await this.startOperation({
				reason: latest.reason ?? `Converge plugin runtime generation ${latest.generation}`,
				source: latest.source,
				actorUserId: latest.actorUserId,
				tenantId: latest.tenantId,
				sourceIp: latest.sourceIp,
				pluginGeneration: latest.generation,
				pluginChanges: changes,
				runtimeRequirements: []
			})
		} catch (error) {
			if (!(error instanceof ConflictException)) throw error
			const restartId = await this.redis.get(ACTIVE_RESTART_KEY)
			return restartId ? await this.readOperationResponse(restartId) : null
		}
	}

	private async reconcileLocalPlugins(): Promise<void> {
		const desired = await this.generations.readDesired()
		if (!desired || desired.status !== 'completed' || this.lifecycle.readiness().status === 'draining') return
		if (desired.generation !== (await this.generations.current())) return
		const result = evaluateRuntimeRequirements(desired.requirements, this.instanceRegistry.getPluginState())
		if (result.status !== 'failed') return
		if (await this.generations.hasAttempted(this.instanceRegistry.instanceId, desired.generation)) return
		try {
			await this.startOperation({
				source: 'plugin-catch-up',
				reason: `Catch up replica ${this.instanceRegistry.instanceId} to plugin generation ${desired.generation}`,
				pluginGeneration: desired.generation,
				pluginChanges: [],
				runtimeRequirements: desired.requirements
			})
		} catch (error) {
			if (!(error instanceof ConflictException)) throw error
		}
	}

	private async readOperationResponse(restartId: string): Promise<IRuntimeRestartResponse> {
		const metadata = await this.readMetadata(restartId)
		if (metadata) return this.operationResponse(metadata)

		return {
			accepted: true,
			restartId,
			mode: 'rolling-self-signal',
			instanceId: this.lifecycle.instanceId,
			requestedAt: new Date().toISOString(),
			signalAfterMs: this.signalDelayMs,
			drainTimeoutMs: this.drainTimeoutMs
		}
	}

	private async readMetadata(restartId: string): Promise<RestartOperationMetadata | null> {
		const value = await this.redis.get(this.metadataKey(restartId))
		if (!value) return null
		try {
			const parsed = JSON.parse(value) as RestartOperationMetadata
			if (
				parsed.restartId !== restartId ||
				!Array.isArray(parsed.pluginGenerations) ||
				!Array.isArray(parsed.runtimeRequirements) ||
				(parsed.phase !== 'collecting' && parsed.phase !== 'rolling')
			) {
				return null
			}
			return parsed
		} catch {
			return null
		}
	}

	private async writeMetadata(metadata: RestartOperationMetadata): Promise<void> {
		await this.redis.set(this.metadataKey(metadata.restartId), JSON.stringify(metadata), {
			EX: operationStateTtlSeconds(metadata)
		})
	}

	private async releaseLock(key: string, value?: string): Promise<boolean> {
		if (!value || !this.redis.eval) return false
		try {
			const result = await this.redis.eval(RELEASE_LOCK_SCRIPT, { keys: [key], arguments: [value] })
			return Number(result) === 1
		} catch (error) {
			this.logger.warn(`Failed to release runtime restart lock: ${this.describeError(error)}`)
			return false
		}
	}

	private async extendActiveRestart(metadata: RestartOperationMetadata): Promise<void> {
		if (!metadata.deadlineAt || !this.redis.eval) {
			throw new Error('Redis scripting is required to extend the runtime restart deadline')
		}
		const remainingExecutionMs = Math.max(1, new Date(metadata.deadlineAt).getTime() - Date.now())
		const result = await this.redis.eval(EXTEND_LOCK_SCRIPT, {
			keys: [ACTIVE_RESTART_KEY],
			arguments: [metadata.restartId, `${remainingExecutionMs + ACTIVE_RESTART_EXPIRY_GRACE_MS}`]
		})
		if (Number(result) !== 1) {
			throw new Error(`Runtime restart ${metadata.restartId} lost its active lease before registration completed`)
		}
	}

	private async claimRestartSlot(metadata: RestartOperationMetadata, lockToken: string): Promise<number | null> {
		const batchSize = 1
		for (let slot = 0; slot < batchSize; slot += 1) {
			const claimed = await this.redis.set(this.restartSlotKey(metadata.restartId, slot), lockToken, {
				NX: true,
				PX: REPLICA_RESTART_TIMEOUT_MS
			})
			if (claimed === 'OK') return slot
		}
		return null
	}

	private async releaseTargetRestartSlot(restartId: string, target: RestartTargetState): Promise<boolean> {
		if (typeof target.restartSlot === 'number') {
			return await this.releaseRestartSlot(restartId, target.restartSlot, target.lockToken)
		}
		return await this.releaseLock(this.legacyTurnKey(restartId), target.lockToken)
	}

	private async releaseRestartSlot(restartId: string, slot: number, lockToken?: string): Promise<boolean> {
		return await this.releaseLock(this.restartSlotKey(restartId, slot), lockToken)
	}

	private metadataKey(restartId: string) {
		return `xpert:system:runtime:restart:${restartId}:metadata`
	}
	private legacyTurnKey(restartId: string) {
		return `xpert:system:runtime:restart:${restartId}:turn`
	}
	private restartSlotKey(restartId: string, slot: number) {
		return `xpert:system:runtime:restart:${restartId}:slot:${slot}`
	}
	private registrationKey(restartId: string) {
		return `xpert:system:runtime:restart:${restartId}:registration`
	}

	private restartInProgress(restartId?: string): ConflictException {
		return new ConflictException({
			statusCode: 409,
			errorCode: 'RUNTIME_RESTART_IN_PROGRESS',
			message: 'An API runtime restart is already in progress',
			...(restartId ? { restartId } : {})
		})
	}

	private writeAuditLog(event: string, details: Record<string, unknown>): void {
		this.logger.warn(JSON.stringify({ event, pid: process.pid, ...details }))
	}

	private describeError(error: unknown): string {
		return error instanceof Error ? error.message : String(error)
	}
}
