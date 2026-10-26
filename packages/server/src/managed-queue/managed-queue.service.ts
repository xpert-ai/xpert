import { TaskControlStore, taskControlId } from '../task-control'
import { ControlRuntimeAdmissionService, controlAdmissionUnavailable } from '../task-control'
import { Interval } from '@nestjs/schedule'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { ApiKeyBindingType, SecretTokenBindingType, ENTERPRISE_H5_PLATFORMS } from '@xpert-ai/contracts'
import {
	MANAGED_QUEUE_CONTROLLED_NAME,
	MANAGED_QUEUE_CONTROLLED_BROWSER_NAME,
	MANAGED_QUEUE_ADMITTED_NAME,
	MANAGED_QUEUE_ADMITTED_BROWSER_NAME
} from './constants'
import { InjectQueue } from '@nestjs/bullmq'
import { Injectable, Optional } from '@nestjs/common'
import type {
	ManagedQueueCancelInput,
	ManagedQueueCancelResult,
	ManagedQueueEnqueueInput,
	ManagedQueueEnqueueResult,
	ManagedQueueExecutionPool,
	ManagedQueueExecutionPoolHealth,
	ManagedQueueJobSnapshot,
	ManagedQueueRemoveOption,
	ManagedQueueRedis,
	ManagedQueueService as ManagedQueueServiceContract
} from '@xpert-ai/plugin-sdk'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import type { JobsOptions, Queue } from 'bullmq'
import { MANAGED_QUEUE_PHYSICAL_QUEUE_NAME, MANAGED_QUEUE_SANDBOX_BROWSER_QUEUE_NAME } from './constants'
import type { ManagedQueueActorSnapshot, ManagedQueueDelegationSnapshot, ManagedQueueEnvelope } from './constants'

@Injectable()
export class ManagedQueueService implements ManagedQueueServiceContract {
	constructor(
		@InjectQueue(MANAGED_QUEUE_PHYSICAL_QUEUE_NAME)
		private readonly defaultQueue: Queue<ManagedQueueEnvelope>,
		@Optional()
		@InjectQueue(MANAGED_QUEUE_SANDBOX_BROWSER_QUEUE_NAME)
		private readonly sandboxBrowserQueue: Queue<ManagedQueueEnvelope> = defaultQueue,
		@InjectQueue(MANAGED_QUEUE_CONTROLLED_NAME) private readonly controlledQueue: Queue<ManagedQueueEnvelope>,
		@InjectQueue(MANAGED_QUEUE_CONTROLLED_BROWSER_NAME)
		private readonly controlledBrowserQueue: Queue<ManagedQueueEnvelope>,
		private readonly controls: TaskControlStore,
		@InjectQueue(MANAGED_QUEUE_ADMITTED_NAME) private readonly admittedQueue: Queue<ManagedQueueEnvelope>,
		@InjectQueue(MANAGED_QUEUE_ADMITTED_BROWSER_NAME)
		private readonly admittedBrowserQueue: Queue<ManagedQueueEnvelope>,
		private readonly admission: ControlRuntimeAdmissionService
	) {}

	async enqueue<TPayload = unknown>(input: ManagedQueueEnqueueInput<TPayload>): Promise<ManagedQueueEnqueueResult> {
		const executionPool = input.executionPool ?? 'default'
		const identity = this.captureCurrentIdentity(input)
		const envelope: ManagedQueueEnvelope<TPayload> = {
			pluginName: this.requireValue(input.pluginName, 'pluginName'),
			queueName: this.requireValue(input.queueName, 'queueName'),
			jobName: this.requireValue(input.jobName, 'jobName'),
			payload: input.payload,
			tenantId: input.tenantId ?? null,
			organizationId: input.organizationId ?? null,
			scopeKey: input.scopeKey ?? null,
			userId: identity.actor?.userId ?? input.userId ?? null,
			...(identity.actor ? { actor: identity.actor } : {}),
			...(identity.delegation ? { delegation: identity.delegation } : {}),
			executionPool,
			enqueuedAt: new Date().toISOString()
		}
		// Queue producers opt in explicitly; historical domain schedulers retain their own lifecycle.
		const parent = input.controlPolicy ? await this.controls.producer() : undefined
		if (input.controlPolicy && !parent) throw controlAdmissionUnavailable('protocol')
		if (parent) {
			if (!envelope.tenantId) throw new Error('Controlled queue requires tenant scope')
			const controlContract = input.controlContract?.trim()
			if (!controlContract || controlContract.length > 160) throw controlAdmissionUnavailable('handler')
			await this.admission.requireQueueWorker(
				{
					pluginName: envelope.pluginName,
					queueName: envelope.queueName,
					jobName: envelope.jobName,
					scopeKey: envelope.scopeKey ?? null,
					controlContract
				},
				executionPool,
				input.controlPolicy === 'attached' && input.drainOnPause === true
			)
			const jobId = input.jobId ?? randomUUID()
			const registration = {
				tenantId: envelope.tenantId,
				organizationId: envelope.organizationId,
				kind: 'managed-queue' as const,
				resourceId: `${executionPool}/${jobId}`,
				parent,
				policy: input.controlPolicy,
				drainOnPause: input.drainOnPause ?? false
			}
			const targetId = taskControlId(registration)
			const controlled = {
				...envelope,
				control: { version: 2 as const, targetId },
				controlContract,
				controlProtocol: 3 as const
			}
			const previous = await this.controls.publication(targetId)
			if (previous) {
				const persisted = z.object({ envelope: z.unknown() }).parse(previous.payload)
				controlled.enqueuedAt = parseControlledEnvelope(persisted.envelope).enqueuedAt
			}
			const options = {
				...this.toJobOptions(input),
				jobId,
				attempts: 1,
				removeOnComplete: false,
				removeOnFail: false
			}
			await this.controls.publish(registration, { envelope: controlled, options }, 'managed-queue-v3')
			try {
				await this.admittedQueueFor(executionPool).add(envelope.jobName, controlled, options)
				await this.controls.published(targetId, true)
			} catch {
				await this.controls.published(targetId, false)
			}
			return { jobId }
		}
		const job = await this.queueFor(executionPool).add(envelope.jobName, envelope, this.toJobOptions(input))
		return { jobId: String(job.id) }
	}

	async cancel(input: ManagedQueueCancelInput): Promise<ManagedQueueCancelResult> {
		const jobId = this.requireValue(input.jobId, 'jobId')
		const job = await this.findJob(jobId, input.executionPool)
		if (!job) {
			const tenantId = RequestContext.currentTenantId()
			if (tenantId) {
				const scope = { tenantId, organizationId: RequestContext.getOrganizationId() }
				for (const pool of input.executionPool ? [input.executionPool] : ['default', 'sandbox-browser']) {
					const target = await this.controls.find(scope, 'managed-queue', `${pool}/${jobId}`)
					if (!target) continue
					await this.controls.change(target.id, 'terminated')
					const stopped = await this.controls.settleUnstarted(target.id)
					return stopped
						? { success: true, jobId, state: 'cancelled' }
						: { success: false, jobId, reason: 'active' }
				}
			}
			return { success: false, jobId, reason: 'not_found' }
		}

		if (job.data.control) {
			const target = await this.controls.read(job.data.control.targetId)
			if (
				!target ||
				target.tenantId !== RequestContext.currentTenantId() ||
				target.organizationId !== (RequestContext.getOrganizationId() ?? null)
			)
				throw new Error('Queue control scope mismatch')
			await this.controls.change(target.id, 'terminated')
		}
		const state = await job.getState().catch(() => undefined)
		if (state === 'active') {
			return { success: false, jobId, state, reason: 'active' }
		}
		if (state === 'completed' || state === 'failed') {
			return { success: false, jobId, state, reason: state }
		}
		const removableStates = new Set(['waiting', 'delayed', 'prioritized', 'waiting-children', 'paused'])
		if (state && !removableStates.has(state)) {
			return { success: false, jobId, state, reason: 'not_removable' }
		}

		try {
			await job.remove()
			return { success: true, jobId, state }
		} catch (error) {
			return {
				success: false,
				jobId,
				state,
				reason: 'failed',
				error: error instanceof Error ? error.message : String(error)
			}
		}
	}

	async getJob<TPayload = unknown>(input: {
		jobId: string
		executionPool?: ManagedQueueExecutionPool
	}): Promise<ManagedQueueJobSnapshot<TPayload> | null> {
		const jobId = this.requireValue(input.jobId, 'jobId')
		const job = await this.findJob(jobId, input.executionPool)
		if (!job) {
			return null
		}
		const envelope = job.data as ManagedQueueEnvelope<TPayload>
		return {
			id: String(job.id),
			name: envelope.jobName,
			data: envelope.payload,
			attemptsMade: job.attemptsMade,
			opts: job.opts as Record<string, unknown>,
			state: await job.getState().catch(() => undefined),
			failedReason: job.failedReason || undefined,
			timestamp: job.timestamp,
			processedOn: job.processedOn,
			finishedOn: job.finishedOn
		}
	}

	/** Returns Worker readiness without coupling callers to BullMQ queue internals. */
	async getExecutionPoolHealth(input: {
		executionPool: ManagedQueueExecutionPool
	}): Promise<ManagedQueueExecutionPoolHealth> {
		try {
			const workerCount = await this.queueFor(input.executionPool).getWorkersCount()
			return {
				executionPool: input.executionPool,
				available: workerCount > 0,
				workerCount,
				...(workerCount > 0
					? {}
					: {
							warning: `No active Managed Queue worker is consuming the ${input.executionPool} execution pool.`
						})
			}
		} catch (error) {
			return {
				executionPool: input.executionPool,
				available: false,
				workerCount: 0,
				warning: `Unable to inspect the ${input.executionPool} execution pool: ${
					error instanceof Error ? error.message : String(error)
				}`
			}
		}
	}

	async getRedis(): Promise<ManagedQueueRedis> {
		return (await (this.defaultQueue as unknown as { client: Promise<ManagedQueueRedis> })
			.client) as ManagedQueueRedis
	}

	private publishing = false
	@Interval(2000)
	async reconcilePublications() {
		if (this.publishing) return
		this.publishing = true
		try {
			for (const row of [
				...(await this.controls.publications('managed-queue')),
				...(await this.controls.publications('managed-queue-v3'))
			]) {
				try {
					const parsed = z
						.object({
							envelope: z
								.object({
									jobName: z.string(),
									executionPool: z.enum(['default', 'sandbox-browser']),
									control: z.object({ version: z.literal(2), targetId: z.string().uuid() })
								})
								.passthrough(),
							options: z.object({ jobId: z.string() }).passthrough()
						})
						.parse(row.payload)
					if (parsed.envelope.control.targetId !== row.targetId)
						throw new Error('Queue control identity mismatch')
					// Validate the complete envelope before crossing the persisted payload boundary.
					const envelope = parseControlledEnvelope(parsed.envelope)
					if ((row.transport === 'managed-queue-v3') !== (envelope.controlProtocol === 3))
						throw controlAdmissionUnavailable('protocol')
					const queue =
						row.transport === 'managed-queue-v3'
							? this.admittedQueueFor(envelope.executionPool)
							: this.queueFor(envelope.executionPool, true)
					await queue.add(envelope.jobName, envelope, {
						...parsed.options,
						attempts: 1,
						removeOnComplete: false,
						removeOnFail: false
					})
					await this.controls.published(row.targetId, true)
				} catch {
					await this.controls.published(row.targetId, false)
				}
			}
		} finally {
			this.publishing = false
		}
	}

	private queueFor(executionPool: ManagedQueueExecutionPool, controlled = false) {
		if (controlled) return executionPool === 'sandbox-browser' ? this.controlledBrowserQueue : this.controlledQueue
		return executionPool === 'sandbox-browser' ? this.sandboxBrowserQueue : this.defaultQueue
	}

	private admittedQueueFor(pool: ManagedQueueExecutionPool) {
		return pool === 'sandbox-browser' ? this.admittedBrowserQueue : this.admittedQueue
	}

	private async findJob(jobId: string, executionPool?: ManagedQueueExecutionPool) {
		if (executionPool) {
			return (
				(await this.admittedQueueFor(executionPool).getJob(jobId)) ??
				(await this.queueFor(executionPool, true).getJob(jobId)) ??
				this.queueFor(executionPool).getJob(jobId)
			)
		}
		return (
			(await this.admittedQueue.getJob(jobId)) ??
			(await this.admittedBrowserQueue.getJob(jobId)) ??
			(await this.controlledQueue.getJob(jobId)) ??
			(await this.controlledBrowserQueue.getJob(jobId)) ??
			(await this.defaultQueue.getJob(jobId)) ??
			this.sandboxBrowserQueue.getJob(jobId)
		)
	}

	private toJobOptions(input: ManagedQueueEnqueueInput): JobsOptions {
		return {
			...(input.jobId ? { jobId: input.jobId } : {}),
			...(Number.isFinite(input.delayMs) && input.delayMs > 0 ? { delay: Math.trunc(input.delayMs) } : {}),
			...(Number.isFinite(input.attempts) && input.attempts > 0 ? { attempts: Math.trunc(input.attempts) } : {}),
			...(input.backoffMs ? { backoff: this.toBackoff(input.backoffMs) } : {}),
			...(input.removeOnComplete !== undefined
				? { removeOnComplete: this.toKeepJobs(input.removeOnComplete) }
				: {}),
			...(input.removeOnFail !== undefined ? { removeOnFail: this.toKeepJobs(input.removeOnFail) } : {})
		}
	}

	private toBackoff(backoff: ManagedQueueEnqueueInput['backoffMs']): JobsOptions['backoff'] {
		if (typeof backoff === 'number') {
			return {
				type: 'fixed',
				delay: backoff
			}
		}
		return {
			type: backoff?.type ?? 'fixed',
			delay: backoff?.delay ?? 0
		}
	}

	private toKeepJobs(option: ManagedQueueRemoveOption): JobsOptions['removeOnComplete'] {
		if (typeof option === 'object' && option !== null) {
			return {
				...option,
				age: option.age ?? 0
			} as JobsOptions['removeOnComplete']
		}
		return option as JobsOptions['removeOnComplete']
	}

	private captureCurrentIdentity(input: ManagedQueueEnqueueInput): {
		actor?: ManagedQueueActorSnapshot
		delegation?: ManagedQueueDelegationSnapshot
	} {
		const currentUser = RequestContext.currentUser()
		const principal = RequestContext.currentApiPrincipal()
		const actorUserId = this.normalizeId(currentUser?.id)
		const declaredUserId = this.normalizeId(input.userId)
		if (actorUserId && declaredUserId && actorUserId !== declaredUserId) {
			throw new Error('ManagedQueue actor user does not match the requested job user')
		}

		const currentTenantId =
			this.normalizeId(currentUser?.tenantId) ||
			this.normalizeId(principal?.tenantId) ||
			this.normalizeId(principal?.apiKey?.tenantId)
		const jobTenantId = this.normalizeId(input.tenantId)
		if (currentTenantId && jobTenantId && jobTenantId !== currentTenantId) {
			throw new Error('ManagedQueue actor tenant does not match the job tenant')
		}

		const currentOrganizationId =
			this.normalizeId(principal?.requestedOrganizationId) ||
			this.normalizeId(RequestContext.getOrganizationId()) ||
			this.normalizeId(principal?.apiKey?.organizationId)
		const jobOrganizationId = this.normalizeId(input.organizationId)
		if (currentOrganizationId && jobOrganizationId && jobOrganizationId !== currentOrganizationId) {
			throw new Error('ManagedQueue actor organization does not match the job organization')
		}
		// Delayed plugin jobs may restore organization only from the signed job
		// scope; propagate it to both actor and delegation snapshots consistently.
		const effectiveOrganizationId = currentOrganizationId || jobOrganizationId

		const actor =
			actorUserId && currentTenantId
				? ({
						userId: actorUserId,
						tenantId: currentTenantId,
						organizationId: effectiveOrganizationId || null,
						type: principal ? (principal.requestedUserId ? 'delegated_user' : 'service') : 'user'
					} satisfies ManagedQueueActorSnapshot)
				: undefined

		const apiKey = principal?.apiKey
		if (!principal || !currentTenantId) {
			return { actor }
		}

		const delegation: ManagedQueueDelegationSnapshot = {
			tenantId: currentTenantId,
			organizationId: effectiveOrganizationId || null,
			principalType: principal.principalType,
			ownerUserId: this.normalizeId(principal.ownerUserId),
			apiKeyUserId: this.normalizeId(principal.apiKeyUserId),
			requestedUserId: this.normalizeId(principal.requestedUserId),
			requestedOrganizationId: this.normalizeId(principal.requestedOrganizationId),
			clientSecretBindingType: principal.clientSecretBindingType ?? null,
			clientSecretId: this.normalizeId(principal.clientSecretId),
			enterpriseH5Scope: principal.enterpriseH5Scope ?? null,
			resourceScope: principal.resourceScope,
			clientSecretExpiresAt: principal.clientSecretExpiresAt?.toISOString(),
			apiKey: apiKey
				? {
						...(apiKey.type ? { type: apiKey.type } : {}),
						entityId: this.normalizeId(apiKey.entityId),
						tenantId: this.normalizeId(apiKey.tenantId) || currentTenantId,
						organizationId: this.normalizeId(apiKey.organizationId),
						userId: this.normalizeId(apiKey.userId)
					}
				: undefined
		}
		return { actor, delegation }
	}

	private normalizeId(value: unknown): string | null {
		if (typeof value === 'number' && Number.isFinite(value)) {
			return String(value)
		}
		if (typeof value !== 'string') {
			return null
		}
		return value.trim() || null
	}

	private requireValue(value: string | null | undefined, field: string): string {
		const normalized = `${value ?? ''}`.trim()
		if (!normalized) {
			throw new Error(`ManagedQueue ${field} is required`)
		}
		return normalized
	}
}

export function parseControlledEnvelope(value: unknown): ManagedQueueEnvelope {
	const parsed = z
		.object({
			pluginName: z.string(),
			queueName: z.string(),
			jobName: z.string(),
			payload: z.unknown(),
			tenantId: z.string().uuid(),
			organizationId: z.string().uuid().nullable().optional(),
			scopeKey: z.string().nullable().optional(),
			userId: z.string().nullable().optional(),
			executionPool: z.enum(['default', 'sandbox-browser']),
			enqueuedAt: z.string(),
			control: z.object({ version: z.literal(2), targetId: z.string().uuid() }),
			controlProtocol: z.literal(3).optional(),
			controlContract: z.string().min(1).max(160).optional(),
			actor: z
				.object({
					userId: z.string(),
					tenantId: z.string(),
					organizationId: z.string().nullable().optional(),
					type: z.enum(['user', 'delegated_user', 'service'])
				})
				.optional(),
			delegation: z
				.object({
					tenantId: z.string().uuid(),
					organizationId: z.string().uuid().nullish(),
					principalType: z.enum(['api_key', 'client_secret']),
					ownerUserId: z.string().nullish(),
					apiKeyUserId: z.string().nullish(),
					requestedUserId: z.string().nullish(),
					requestedOrganizationId: z.string().nullish(),
					clientSecretBindingType: z.nativeEnum(SecretTokenBindingType).nullish(),
					clientSecretId: z.string().nullish(),
					enterpriseH5Scope: z
						.object({ platform: z.enum(ENTERPRISE_H5_PLATFORMS), integrationId: z.string() })
						.nullish(),
					resourceScope: z
						.discriminatedUnion('kind', [
							z.object({ kind: z.literal('assistant'), xpertId: z.string() }),
							z.object({ kind: z.literal('workspace'), workspaceId: z.string() }),
							z.object({ kind: z.literal('conversation'), conversationId: z.string() })
						])
						.optional(),
					clientSecretExpiresAt: z.string().datetime().optional(),
					apiKey: z
						.object({
							type: z.nativeEnum(ApiKeyBindingType).optional(),
							entityId: z.string().nullish(),
							tenantId: z.string(),
							organizationId: z.string().nullish(),
							userId: z.string().nullish()
						})
						.optional()
				})
				.optional()
		})
		.refine(
			(item) => (item.controlProtocol === 3) === Boolean(item.controlContract),
			'Controlled handler contract requires queue protocol 3'
		)
		.parse(value)
	// The schema validates persisted JSON; current actor and resource authorization still runs in the worker.
	return parsed as ManagedQueueEnvelope
}
