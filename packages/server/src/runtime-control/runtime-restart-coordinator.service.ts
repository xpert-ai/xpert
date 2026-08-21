/**
 * Invariants:
 * - Restart participants register from a durable Redis event; no replica count is inferred from heartbeats.
 * - A process already satisfying every runtime requirement acknowledges without restarting.
 * - A bounded batch of stale processes drains at a time, and replacements acknowledge only after reporting plugin state.
 * - Plugin generations are monotonic, so changes during a rollout cause a follow-up rollout.
 */
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
	ServiceUnavailableException
} from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { REDIS_CLIENT } from '../core/redis/types'
import { InstanceRegistryService, RuntimePluginState } from '../managed-connection'
import { RUNTIME_PROCESS_SIGNALER, RuntimeProcessSignaler } from './runtime-process-signaler'
import { RuntimeLifecycleService } from './runtime-lifecycle.service'

const ACTIVE_RESTART_KEY = 'xpert:system:runtime:restart:active'
const PLUGIN_GENERATION_KEY = 'xpert:system:plugin-runtime:generation'
const PLUGIN_GENERATION_PREFIX = 'xpert:system:plugin-runtime:generation:'
const RESTART_CHANNEL = 'xpert:system:runtime:restart:events'
const DEFAULT_SIGNAL_DELAY_MS = 750
const DEFAULT_DRAIN_TIMEOUT_MS = 30_000
const REGISTRATION_WINDOW_MS = 2_000
const PENDING_TARGET_TIMEOUT_MS = 45_000
const REPLICA_RESTART_TIMEOUT_MS = 120_000
const INITIAL_OPERATION_TTL_MS = 15 * 60_000
const OPERATION_DEADLINE_GRACE_MS = 30_000
const ACTIVE_RESTART_EXPIRY_GRACE_MS = 30_000
const OPERATION_STATUS_RETENTION_MS = 15 * 60_000
const PLUGIN_GENERATION_TTL_SECONDS = 24 * 60 * 60
const COORDINATOR_POLL_MS = 1_000
const MAX_UNAVAILABLE_RATIO = 0.2
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
const PUBLISH_PLUGIN_GENERATION_SCRIPT = `
-- xpert-publish-plugin-generation
local generation = redis.call('incr', KEYS[1])
local change = cjson.decode(ARGV[1])
change['generation'] = generation
local state = { generation = generation, status = 'in_progress' }
redis.call('set', ARGV[2] .. generation .. ':change', cjson.encode(change), 'EX', tonumber(ARGV[3]))
redis.call('set', ARGV[2] .. generation .. ':status', cjson.encode(state), 'EX', tonumber(ARGV[3]))
return generation
`

type RuntimeRestartRedisClient = {
	set: (key: string, value: string, options?: { NX?: boolean; PX?: number; EX?: number }) => Promise<string | null>
	get: (key: string) => Promise<string | null>
	hSet: (key: string, field: string, value: string) => Promise<number>
	hGetAll: (key: string) => Promise<Record<string, string>>
	expire: (key: string, seconds: number) => Promise<boolean | number>
	eval?: (script: string, options: { keys: string[]; arguments: string[] }) => Promise<number | string | null>
	duplicate?: () => RuntimeRestartRedisSubscriber
	publish?: (channel: string, message: string) => Promise<number>
}

type RuntimeRestartRedisSubscriber = {
	connect?: () => Promise<unknown>
	subscribe?: (channel: string, listener: (message: string) => void) => Promise<unknown>
	unsubscribe?: (channel: string) => Promise<unknown>
	quit?: () => Promise<unknown>
}

type RestartOperationMetadata = {
	restartId: string
	requestedAt: string
	reason?: string
	source: 'interactive' | 'plugin-change' | 'plugin-follow-up'
	actorUserId?: string
	tenantId?: string
	sourceIp?: string
	pluginGeneration: number
	pluginGenerations: number[]
	runtimeRequirements: IRuntimePluginRequirement[]
	registrationDeadlineAt: string
	phase: 'collecting' | 'rolling'
	targetReplicaCount: number
	maxConcurrentRestarts?: number
	deadlineAt?: string
}

type RestartTargetState = {
	replicaId: string
	expectedBootId: string
	status: 'pending' | 'restarting' | 'completed' | 'failed'
	updatedAt: string
	startedAt?: string
	acknowledgedBootId?: string
	lockToken?: string
	restartSlot?: number
	error?: string
}

type PluginGenerationChange = {
	generation: number
	requirements: IRuntimePluginRequirement[]
	source: 'interactive' | 'plugin-change'
	reason?: string
	actorUserId?: string
	tenantId?: string
	sourceIp?: string
}

type PluginGenerationState = {
	generation: number
	status: RuntimeRestartStatus
	restartId?: string
	error?: string
}

type RestartOperationInput = {
	reason?: string
	source: RestartOperationMetadata['source']
	actorUserId?: string
	tenantId?: string
	sourceIp?: string
	pluginGeneration: number
	pluginChanges: PluginGenerationChange[]
	runtimeRequirements: IRuntimePluginRequirement[]
}

export interface PluginRuntimeChangeInput {
	pluginName: string
	version?: string | null
	runtimeRevision?: string | null
	scopeKey: string
}

export interface PluginRuntimeChangeResult {
	scheduled: boolean
	generation: number
}

@Injectable()
export class RuntimeRestartCoordinatorService implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(RuntimeRestartCoordinatorService.name)
	private readonly signalDelayMs = DEFAULT_SIGNAL_DELAY_MS
	private readonly drainTimeoutMs = DEFAULT_DRAIN_TIMEOUT_MS
	private subscriber?: RuntimeRestartRedisSubscriber
	private pollTimer?: ReturnType<typeof setInterval>
	private processing = false

	constructor(
		@Inject(REDIS_CLIENT)
		private readonly redis: RuntimeRestartRedisClient,
		@Inject(RUNTIME_PROCESS_SIGNALER)
		private readonly processSignaler: RuntimeProcessSignaler,
		private readonly lifecycle: RuntimeLifecycleService,
		private readonly instanceRegistry: InstanceRegistryService
	) {}

	async onModuleInit(): Promise<void> {
		await this.startSubscriber()
		this.pollTimer = setInterval(() => void this.processActiveRestart(), COORDINATOR_POLL_MS)
		this.pollTimer.unref?.()
		void this.processActiveRestart()
	}

	async onModuleDestroy(): Promise<void> {
		if (this.pollTimer) {
			clearInterval(this.pollTimer)
			this.pollTimer = undefined
		}
		await this.subscriber?.unsubscribe?.(RESTART_CHANNEL).catch(() => undefined)
		await this.subscriber?.quit?.().catch(() => undefined)
		this.subscriber = undefined
	}

	async requestRestart(input: {
		reason?: string
		source: RestartOperationMetadata['source']
		actorUserId?: string
		tenantId?: string
		sourceIp?: string
		runtimeRequirements?: IRuntimePluginRequirement[]
	}): Promise<IRuntimeRestartResponse> {
		const runtimeRequirements = this.mergeRuntimeRequirements(input.runtimeRequirements ?? [])
		if (runtimeRequirements.length) {
			const generation = await this.publishPluginGeneration({
				generation: 0,
				requirements: runtimeRequirements,
				source: 'interactive',
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
		const pendingPluginChanges = await this.readPendingPluginChanges()
		const pluginGeneration = pendingPluginChanges.at(-1)?.generation ?? (await this.currentPluginGeneration())

		return await this.startOperation({
			reason: input.reason,
			source: input.source,
			actorUserId: input.actorUserId,
			tenantId: input.tenantId,
			sourceIp: input.sourceIp,
			pluginGeneration,
			pluginChanges: pendingPluginChanges,
			runtimeRequirements: []
		})
	}

	async recordPluginChange(input: PluginRuntimeChangeInput): Promise<PluginRuntimeChangeResult> {
		let generation: number
		try {
			generation = await this.publishPluginGeneration({
				generation: 0,
				requirements: [
					{
						scopeKey: input.scopeKey,
						pluginName: input.pluginName,
						...(input.version ? { version: input.version } : {}),
						...(input.runtimeRevision ? { runtimeRevision: input.runtimeRevision } : {}),
						state: 'loaded'
					}
				],
				source: 'plugin-change',
				reason: `Activate ${input.pluginName}@${input.version ?? 'latest'} in ${input.scopeKey}`
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
		const targets = await this.readTargets(restartId)
		const failed = targets.filter((target) => target.status === 'failed')
		const completed = targets.filter((target) => target.status === 'completed')
		const completedOperation =
			metadata.phase === 'rolling' &&
			completed.length === metadata.targetReplicaCount &&
			targets.length === metadata.targetReplicaCount
		const deadlineError = !completedOperation && this.operationDeadlineError(metadata)
		const status: RuntimeRestartStatus = failed.length
			? 'failed'
			: completedOperation
				? 'completed'
				: deadlineError
					? 'failed'
					: 'in_progress'

		return {
			restartId,
			mode: 'rolling-self-signal',
			status,
			requestedAt: metadata.requestedAt,
			targetReplicaCount: metadata.phase === 'collecting' ? targets.length : metadata.targetReplicaCount,
			completedReplicaCount: completed.length,
			failedReplicaCount: failed.length || (deadlineError ? 1 : 0),
			pluginGeneration: metadata.pluginGeneration,
			...(failed[0]?.error || deadlineError ? { error: failed[0]?.error ?? deadlineError } : {})
		}
	}

	async getPluginConvergenceStatus(generation: number): Promise<IPluginRuntimeConvergenceStatus | null> {
		const state = await this.readPluginGenerationState(generation)
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
		const metadata = this.buildOperationMetadata(input)
		const { restartId } = metadata
		await this.writeMetadata(metadata)
		const claimed = await this.redis.set(ACTIVE_RESTART_KEY, restartId, { NX: true, PX: INITIAL_OPERATION_TTL_MS })
		if (claimed !== 'OK') {
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

	private buildOperationMetadata(input: RestartOperationInput): RestartOperationMetadata {
		const restartId = randomUUID()
		const requestedAt = new Date().toISOString()
		return {
			restartId,
			requestedAt,
			reason: input.reason?.trim() || undefined,
			source: input.source,
			actorUserId: input.actorUserId,
			tenantId: input.tenantId,
			sourceIp: input.sourceIp,
			pluginGeneration: input.pluginGeneration,
			pluginGenerations: input.pluginChanges.map((change) => change.generation),
			runtimeRequirements: this.mergeRuntimeRequirements([
				...input.runtimeRequirements,
				...input.pluginChanges.flatMap((change) => change.requirements)
			]),
			registrationDeadlineAt: new Date(Date.now() + REGISTRATION_WINDOW_MS).toISOString(),
			phase: 'collecting',
			targetReplicaCount: 0
		}
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
			runtimeRequirements: metadata.runtimeRequirements
		})
		for (const generation of metadata.pluginGenerations) {
			await this.writePluginGenerationState({
				generation,
				status: 'in_progress',
				restartId: metadata.restartId
			})
		}
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
		if (this.processing) return
		this.processing = true
		try {
			const restartId = await this.redis.get(ACTIVE_RESTART_KEY)
			if (!restartId) {
				await this.ensurePendingPluginOperation()
				return
			}
			let metadata = await this.readMetadata(restartId)
			if (!metadata) {
				await this.releaseLock(ACTIVE_RESTART_KEY, restartId)
				return
			}

			if (metadata.phase === 'collecting') {
				await this.registerCurrentTarget(metadata)
				if (Date.now() < new Date(metadata.registrationDeadlineAt).getTime()) return
				metadata = await this.finalizeRegistration(metadata)
				if (metadata.phase === 'collecting') return
			}

			let targets = await this.readTargets(restartId)
			if (targets.length > metadata.targetReplicaCount) {
				// A participant may finish its pre-deadline HSET while another process freezes registration.
				const maxConcurrentRestarts = metadata.maxConcurrentRestarts ?? this.restartBatchSize(targets.length)
				metadata = {
					...metadata,
					targetReplicaCount: targets.length,
					maxConcurrentRestarts,
					deadlineAt: this.operationDeadlineAt(targets.length, maxConcurrentRestarts)
				}
				await this.extendActiveRestart(metadata)
				await this.redis.expire(this.targetsKey(metadata.restartId), this.operationStateTtlSeconds(metadata))
				await this.writeMetadata(metadata)
			}
			const ownTarget = targets.find((target) => target.replicaId === this.instanceRegistry.instanceId)
			if (ownTarget?.status === 'pending' && ownTarget.expectedBootId === this.instanceRegistry.bootId) {
				await this.writeTarget(restartId, { ...ownTarget, updatedAt: new Date().toISOString() })
				targets = await this.readTargets(restartId)
			}

			const stalePending = targets.find(
				(target) =>
					target.status === 'pending' &&
					Date.now() - new Date(target.updatedAt).getTime() > PENDING_TARGET_TIMEOUT_MS
			)
			if (stalePending) {
				await this.failTarget(
					restartId,
					stalePending,
					`Replica ${stalePending.replicaId} disappeared before restart`
				)
				await this.finishOperation(metadata, 'failed')
				return
			}
			const timedOut = targets.find(
				(target) =>
					target.status === 'restarting' &&
					target.startedAt &&
					Date.now() - new Date(target.startedAt).getTime() > REPLICA_RESTART_TIMEOUT_MS
			)
			if (timedOut) {
				await this.failTarget(restartId, timedOut, `Replica ${timedOut.replicaId} did not return after restart`)
				await this.finishOperation(metadata, 'failed')
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
			const deadlineError = this.operationDeadlineError(metadata)
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
				const result = this.evaluateRuntimeRequirements(metadata.runtimeRequirements)
				if (result.status === 'waiting') return
				if (result.status === 'failed') {
					await this.failTarget(restartId, ownTarget, result.error)
					await this.finishOperation(metadata, 'failed')
					return
				}
				await this.completeTarget(restartId, ownTarget, 'replacement-ready')
				return
			}

			if (metadata.runtimeRequirements.length) {
				const result = this.evaluateRuntimeRequirements(metadata.runtimeRequirements)
				if (result.status === 'satisfied') {
					await this.completeTarget(restartId, ownTarget, 'already-current')
					return
				}
			}
			if (ownTarget.status === 'restarting') return
			await this.beginReplicaRestart(metadata, ownTarget)
		} catch (error) {
			this.logger.warn(`Runtime restart coordination tick failed: ${this.describeError(error)}`)
		} finally {
			this.processing = false
		}
	}

	private async registerCurrentTarget(metadata: RestartOperationMetadata): Promise<void> {
		if (Date.now() >= new Date(metadata.registrationDeadlineAt).getTime()) return
		const current = (await this.readTargets(metadata.restartId)).find(
			(target) => target.replicaId === this.instanceRegistry.instanceId
		)
		if (current) {
			if (current.status === 'pending' && current.expectedBootId === this.instanceRegistry.bootId) {
				await this.writeTarget(metadata.restartId, { ...current, updatedAt: new Date().toISOString() })
			}
			return
		}
		await this.writeTarget(metadata.restartId, {
			replicaId: this.instanceRegistry.instanceId,
			expectedBootId: this.instanceRegistry.bootId,
			status: 'pending',
			updatedAt: new Date().toISOString()
		})
		await this.redis.expire(this.targetsKey(metadata.restartId), this.operationStateTtlSeconds(metadata))
	}

	private async finalizeRegistration(metadata: RestartOperationMetadata): Promise<RestartOperationMetadata> {
		const token = `${metadata.restartId}:${this.instanceRegistry.instanceId}:${randomUUID()}`
		const claimed = await this.redis.set(this.registrationKey(metadata.restartId), token, { NX: true, PX: 5_000 })
		if (claimed !== 'OK') return (await this.readMetadata(metadata.restartId)) ?? metadata
		try {
			const current = await this.readMetadata(metadata.restartId)
			if (!current || current.phase === 'rolling') return current ?? metadata
			const targets = await this.readTargets(metadata.restartId)
			const maxConcurrentRestarts = this.restartBatchSize(targets.length)
			const rolling: RestartOperationMetadata = {
				...current,
				phase: 'rolling',
				targetReplicaCount: targets.length,
				maxConcurrentRestarts,
				deadlineAt: this.operationDeadlineAt(targets.length, maxConcurrentRestarts)
			}
			await this.extendActiveRestart(rolling)
			await this.redis.expire(this.targetsKey(rolling.restartId), this.operationStateTtlSeconds(rolling))
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
		const lockToken = `${metadata.restartId}:${target.replicaId}:${this.instanceRegistry.bootId}:${randomUUID()}`
		const restartSlot = await this.claimRestartSlot(metadata, lockToken)
		if (restartSlot === null) return

		const currentTargets = await this.readTargets(metadata.restartId)
		const current = currentTargets.find((item) => item.replicaId === target.replicaId)
		if (!current || current.status !== 'pending' || current.expectedBootId !== this.instanceRegistry.bootId) {
			await this.releaseRestartSlot(metadata.restartId, restartSlot, lockToken)
			return
		}

		const startedAt = new Date().toISOString()
		const restarting: RestartTargetState = {
			...current,
			status: 'restarting',
			startedAt,
			updatedAt: startedAt,
			lockToken,
			restartSlot
		}
		await this.writeTarget(metadata.restartId, restarting)
		if (!this.lifecycle.beginDrain({ restartId: metadata.restartId, requestedAt: metadata.requestedAt })) {
			await this.writeTarget(metadata.restartId, { ...current, updatedAt: new Date().toISOString() })
			await this.releaseRestartSlot(metadata.restartId, restartSlot, lockToken)
			return
		}

		this.writeAuditLog('runtime.restart.replica-draining', {
			restartId: metadata.restartId,
			replicaId: target.replicaId,
			bootId: this.instanceRegistry.bootId
		})
		const timer = setTimeout(() => void this.terminateAfterDrain(metadata, restarting), this.signalDelayMs)
		timer.unref?.()
	}

	private async terminateAfterDrain(metadata: RestartOperationMetadata, target: RestartTargetState): Promise<void> {
		const drained = await this.lifecycle.waitForIdle(this.drainTimeoutMs)
		this.writeAuditLog('runtime.restart.replica-signaling', {
			restartId: metadata.restartId,
			replicaId: target.replicaId,
			bootId: this.instanceRegistry.bootId,
			drained,
			activeRequests: this.lifecycle.readiness().activeRequests,
			signal: 'SIGTERM'
		})
		try {
			this.processSignaler.signal('SIGTERM')
		} catch (error) {
			await this.failTarget(metadata.restartId, target, this.describeError(error))
			await this.finishOperation(metadata, 'failed')
		}
	}

	private async completeTarget(
		restartId: string,
		target: RestartTargetState,
		reason: 'already-current' | 'replacement-ready'
	): Promise<void> {
		await this.writeTarget(restartId, {
			...target,
			status: 'completed',
			acknowledgedBootId: this.instanceRegistry.bootId,
			updatedAt: new Date().toISOString()
		})
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

	private async failTarget(restartId: string, target: RestartTargetState, error: string): Promise<void> {
		await this.writeTarget(restartId, {
			...target,
			status: 'failed',
			error,
			updatedAt: new Date().toISOString()
		})
		await this.releaseTargetRestartSlot(restartId, target)
	}

	private async finishOperation(
		metadata: RestartOperationMetadata,
		status: Extract<RuntimeRestartStatus, 'completed' | 'failed'>,
		operationError?: string
	): Promise<void> {
		const targets = await this.readTargets(metadata.restartId)
		const error = operationError ?? targets.find((target) => target.status === 'failed')?.error
		for (const generation of metadata.pluginGenerations) {
			await this.writePluginGenerationState({
				generation,
				status,
				restartId: metadata.restartId,
				...(error ? { error } : {})
			})
		}

		let handoffPending = true
		while (handoffPending) {
			const currentGeneration = await this.currentPluginGeneration()
			if (status === 'failed') {
				for (let generation = metadata.pluginGeneration + 1; generation <= currentGeneration; generation += 1) {
					await this.writePluginGenerationState({
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
				const changes = await this.readPluginChanges(metadata.pluginGeneration + 1, currentGeneration)
				const followUp = this.buildOperationMetadata({
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

	private evaluateRuntimeRequirements(
		requirements: IRuntimePluginRequirement[]
	): { status: 'waiting' | 'satisfied' } | { status: 'failed'; error: string } {
		if (!requirements.length) return { status: 'satisfied' }
		const state = this.instanceRegistry.getPluginState()
		if (!state) return { status: 'waiting' }
		for (const requirement of requirements) {
			const failure = this.findRuntimeFailure(state, requirement)
			const plugin = this.findRuntimePlugin(state, requirement)
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

	private findRuntimePlugin(state: RuntimePluginState, requirement: IRuntimePluginRequirement) {
		return state.plugins.find(
			(plugin) =>
				plugin.scopeKey === requirement.scopeKey &&
				(plugin.pluginName === requirement.pluginName || plugin.packageName === requirement.pluginName)
		)
	}

	private findRuntimeFailure(state: RuntimePluginState, requirement: IRuntimePluginRequirement) {
		return state.failures.find(
			(failure) =>
				failure.scopeKey === requirement.scopeKey &&
				(failure.pluginName === requirement.pluginName || failure.packageName === requirement.pluginName)
		)
	}

	private mergeRuntimeRequirements(requirements: IRuntimePluginRequirement[]): IRuntimePluginRequirement[] {
		const merged = new Map<string, IRuntimePluginRequirement>()
		for (const requirement of requirements) {
			merged.set(`${requirement.scopeKey}\u0000${requirement.pluginName}`, requirement)
		}
		return Array.from(merged.values())
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

	private async publishPluginGeneration(change: PluginGenerationChange): Promise<number> {
		if (!this.redis.eval) {
			throw new Error('Redis scripting is required for atomic plugin generation publication')
		}
		const generation = Number(
			await this.redis.eval(PUBLISH_PLUGIN_GENERATION_SCRIPT, {
				keys: [PLUGIN_GENERATION_KEY],
				arguments: [JSON.stringify(change), PLUGIN_GENERATION_PREFIX, `${PLUGIN_GENERATION_TTL_SECONDS}`]
			})
		)
		if (!Number.isInteger(generation) || generation <= 0) {
			throw new Error('Redis returned an invalid plugin runtime generation')
		}
		return generation
	}

	private async ensurePendingPluginOperation(): Promise<IRuntimeRestartResponse | null> {
		const activeRestartId = await this.redis.get(ACTIVE_RESTART_KEY)
		if (activeRestartId) {
			return await this.readOperationResponse(activeRestartId)
		}

		const changes = await this.readPendingPluginChanges()
		if (!changes.length) return null

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

	private async readPendingPluginChanges(): Promise<PluginGenerationChange[]> {
		const currentGeneration = await this.currentPluginGeneration()
		let firstGeneration = currentGeneration + 1
		for (let generation = currentGeneration; generation > 0; generation -= 1) {
			const state = await this.readPluginGenerationState(generation)
			if (state?.status !== 'in_progress') break
			firstGeneration = generation
		}
		return firstGeneration <= currentGeneration
			? await this.readPluginChanges(firstGeneration, currentGeneration)
			: []
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

	private async currentPluginGeneration(): Promise<number> {
		const value = await this.redis.get(PLUGIN_GENERATION_KEY)
		const parsed = Number.parseInt(value ?? '0', 10)
		return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
	}

	private async readPluginChanges(from: number, to: number): Promise<PluginGenerationChange[]> {
		const changes: PluginGenerationChange[] = []
		for (let generation = from; generation <= to; generation += 1) {
			const value = await this.redis.get(this.pluginChangeKey(generation))
			if (!value) throw new Error(`Plugin runtime generation ${generation} is missing`)
			const parsed = this.parsePluginGenerationChange(JSON.parse(value) as unknown)
			if (!parsed || parsed.generation !== generation) {
				throw new Error(`Plugin runtime generation ${generation} is invalid`)
			}
			changes.push(parsed)
		}
		return changes
	}

	private parsePluginGenerationChange(value: unknown): PluginGenerationChange | null {
		if (typeof value !== 'object' || value === null || !('generation' in value)) return null
		if (typeof value.generation !== 'number') return null

		const requirements =
			'requirements' in value && Array.isArray(value.requirements)
				? value.requirements
				: 'requirement' in value
					? [value.requirement]
					: []
		if (
			!requirements.length ||
			!requirements.every((requirement) => this.isRuntimePluginRequirement(requirement))
		) {
			return null
		}

		return {
			generation: value.generation,
			requirements,
			source: 'source' in value && value.source === 'interactive' ? 'interactive' : 'plugin-change',
			...('reason' in value && typeof value.reason === 'string' ? { reason: value.reason } : {}),
			...('actorUserId' in value && typeof value.actorUserId === 'string'
				? { actorUserId: value.actorUserId }
				: {}),
			...('tenantId' in value && typeof value.tenantId === 'string' ? { tenantId: value.tenantId } : {}),
			...('sourceIp' in value && typeof value.sourceIp === 'string' ? { sourceIp: value.sourceIp } : {})
		}
	}

	private isRuntimePluginRequirement(value: unknown): value is IRuntimePluginRequirement {
		return (
			typeof value === 'object' &&
			value !== null &&
			'scopeKey' in value &&
			typeof value.scopeKey === 'string' &&
			'pluginName' in value &&
			typeof value.pluginName === 'string' &&
			'state' in value &&
			(value.state === 'loaded' || value.state === 'absent') &&
			(!('version' in value) || value.version === undefined || typeof value.version === 'string') &&
			(!('runtimeRevision' in value) ||
				value.runtimeRevision === undefined ||
				typeof value.runtimeRevision === 'string')
		)
	}

	private async writePluginGenerationState(state: PluginGenerationState): Promise<void> {
		await this.redis.set(this.pluginGenerationStateKey(state.generation), JSON.stringify(state), {
			EX: PLUGIN_GENERATION_TTL_SECONDS
		})
	}

	private async readPluginGenerationState(generation: number): Promise<PluginGenerationState | null> {
		const value = await this.redis.get(this.pluginGenerationStateKey(generation))
		if (!value) return null
		try {
			const parsed = JSON.parse(value) as PluginGenerationState
			return parsed.generation === generation ? parsed : null
		} catch {
			return null
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
			EX: this.operationStateTtlSeconds(metadata)
		})
	}

	private async readTargets(restartId: string): Promise<RestartTargetState[]> {
		const values = await this.redis.hGetAll(this.targetsKey(restartId))
		const targets: RestartTargetState[] = []
		for (const value of Object.values(values)) {
			try {
				const target = JSON.parse(value) as RestartTargetState
				if (target.replicaId && target.expectedBootId && target.status && target.updatedAt) targets.push(target)
			} catch {
				// Ignore corrupt participant records; the operation timeout remains fail closed.
			}
		}
		return targets.sort((left, right) => left.replicaId.localeCompare(right.replicaId))
	}

	private async writeTarget(restartId: string, target: RestartTargetState): Promise<void> {
		await this.redis.hSet(this.targetsKey(restartId), target.replicaId, JSON.stringify(target))
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

	private restartBatchSize(targetReplicaCount: number): number {
		if (targetReplicaCount <= 1) return 1
		return Math.min(targetReplicaCount - 1, Math.max(1, Math.floor(targetReplicaCount * MAX_UNAVAILABLE_RATIO)))
	}

	private operationDeadlineAt(targetReplicaCount: number, maxConcurrentRestarts: number): string {
		const batchCount = Math.max(1, Math.ceil(targetReplicaCount / maxConcurrentRestarts))
		return new Date(
			Date.now() + batchCount * REPLICA_RESTART_TIMEOUT_MS + OPERATION_DEADLINE_GRACE_MS
		).toISOString()
	}

	private operationDeadlineError(metadata: RestartOperationMetadata): string | undefined {
		if (!metadata.deadlineAt || Date.now() <= new Date(metadata.deadlineAt).getTime()) return undefined
		return `API runtime restart exceeded its server deadline at ${metadata.deadlineAt}`
	}

	private operationStateTtlSeconds(metadata: RestartOperationMetadata): number {
		if (!metadata.deadlineAt) return Math.ceil(INITIAL_OPERATION_TTL_MS / 1_000)
		const remainingExecutionMs = Math.max(0, new Date(metadata.deadlineAt).getTime() - Date.now())
		return Math.ceil((remainingExecutionMs + OPERATION_STATUS_RETENTION_MS) / 1_000)
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
		const batchSize = metadata.maxConcurrentRestarts ?? this.restartBatchSize(metadata.targetReplicaCount)
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
	private targetsKey(restartId: string) {
		return `xpert:system:runtime:restart:${restartId}:targets`
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
	private pluginChangeKey(generation: number) {
		return `${PLUGIN_GENERATION_PREFIX}${generation}:change`
	}
	private pluginGenerationStateKey(generation: number) {
		return `${PLUGIN_GENERATION_PREFIX}${generation}:status`
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
		this.logger.warn(JSON.stringify({ event, ...details }))
	}

	private describeError(error: unknown): string {
		return error instanceof Error ? error.message : String(error)
	}
}
