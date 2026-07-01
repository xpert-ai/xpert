import { InjectQueue } from '@nestjs/bullmq'
import { Injectable } from '@nestjs/common'
import type {
	ManagedQueueCancelInput,
	ManagedQueueCancelResult,
	ManagedQueueEnqueueInput,
	ManagedQueueEnqueueResult,
	ManagedQueueJobSnapshot,
	ManagedQueueRemoveOption,
	ManagedQueueRedis,
	ManagedQueueService as ManagedQueueServiceContract
} from '@xpert-ai/plugin-sdk'
import type { JobsOptions, Queue } from 'bullmq'
import { MANAGED_QUEUE_PHYSICAL_QUEUE_NAME } from './constants'
import type { ManagedQueueEnvelope } from './constants'

@Injectable()
export class ManagedQueueService implements ManagedQueueServiceContract {
	constructor(
		@InjectQueue(MANAGED_QUEUE_PHYSICAL_QUEUE_NAME)
		private readonly queue: Queue<ManagedQueueEnvelope>
	) {}

	async enqueue<TPayload = unknown>(input: ManagedQueueEnqueueInput<TPayload>): Promise<ManagedQueueEnqueueResult> {
		const envelope: ManagedQueueEnvelope<TPayload> = {
			pluginName: this.requireValue(input.pluginName, 'pluginName'),
			queueName: this.requireValue(input.queueName, 'queueName'),
			jobName: this.requireValue(input.jobName, 'jobName'),
			payload: input.payload,
			tenantId: input.tenantId ?? null,
			organizationId: input.organizationId ?? null,
			scopeKey: input.scopeKey ?? null,
			userId: input.userId ?? null,
			enqueuedAt: new Date().toISOString()
		}
		const job = await this.queue.add(envelope.jobName, envelope, this.toJobOptions(input))
		return { jobId: String(job.id) }
	}

	async cancel(input: ManagedQueueCancelInput): Promise<ManagedQueueCancelResult> {
		const jobId = this.requireValue(input.jobId, 'jobId')
		const job = await this.queue.getJob(jobId)
		if (!job) {
			return { success: false, jobId, reason: 'not_found' }
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

	async getJob<TPayload = unknown>(input: { jobId: string }): Promise<ManagedQueueJobSnapshot<TPayload> | null> {
		const jobId = this.requireValue(input.jobId, 'jobId')
		const job = await this.queue.getJob(jobId)
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
			timestamp: job.timestamp,
			processedOn: job.processedOn,
			finishedOn: job.finishedOn
		}
	}

	async getRedis(): Promise<ManagedQueueRedis> {
		return (await (this.queue as unknown as { client: Promise<ManagedQueueRedis> }).client) as ManagedQueueRedis
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

	private requireValue(value: string | null | undefined, field: string): string {
		const normalized = `${value ?? ''}`.trim()
		if (!normalized) {
			throw new Error(`ManagedQueue ${field} is required`)
		}
		return normalized
	}
}
