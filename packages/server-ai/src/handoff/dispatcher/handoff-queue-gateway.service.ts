import { InjectQueue } from '@nestjs/bull'
import { Injectable, Logger } from '@nestjs/common'
import { HandoffMessage } from '@xpert-ai/plugin-sdk'
import { Job, JobStatus, Queue } from 'bull'
import {
	HandoffQueueName,
	XPERT_HANDOFF_JOB,
	XPERT_HANDOFF_QUEUE,
	XPERT_HANDOFF_QUEUES,
	XPERT_HANDOFF_QUEUE_BATCH,
	XPERT_HANDOFF_QUEUE_INTEGRATION,
	XPERT_HANDOFF_QUEUE_REALTIME
} from '../constants'

export interface HandoffQueueEnqueueOptions {
	delayMs?: number
}

export interface HandoffQueueEnqueueItem {
	queueName: HandoffQueueName
	message: HandoffMessage
	options?: HandoffQueueEnqueueOptions
}

export type HandoffQueueScannableJobState = Extract<JobStatus, 'waiting' | 'delayed' | 'paused' | 'active'>

export interface HandoffQueueMatchedJob {
	queueName: HandoffQueueName
	state: HandoffQueueScannableJobState
	job: Job<HandoffMessage>
}

export interface HandoffQueueRemovedJob {
	queueName: HandoffQueueName
	state: HandoffQueueScannableJobState
	jobId: string
	message: HandoffMessage
}

const DEFAULT_SCAN_STATES: HandoffQueueScannableJobState[] = ['waiting', 'delayed', 'paused', 'active']

@Injectable()
export class HandoffQueueGatewayService {
	readonly #logger = new Logger(HandoffQueueGatewayService.name)
	readonly #queueByName: Record<HandoffQueueName, Queue<HandoffMessage>>

	constructor(
		@InjectQueue(XPERT_HANDOFF_QUEUE)
		private readonly defaultQueue: Queue<HandoffMessage>,
		@InjectQueue(XPERT_HANDOFF_QUEUE_REALTIME)
		private readonly realtimeQueue: Queue<HandoffMessage>,
		@InjectQueue(XPERT_HANDOFF_QUEUE_BATCH)
		private readonly batchQueue: Queue<HandoffMessage>,
		@InjectQueue(XPERT_HANDOFF_QUEUE_INTEGRATION)
		private readonly integrationQueue: Queue<HandoffMessage>
	) {
		this.#queueByName = {
			[XPERT_HANDOFF_QUEUE]: this.defaultQueue,
			[XPERT_HANDOFF_QUEUE_REALTIME]: this.realtimeQueue,
			[XPERT_HANDOFF_QUEUE_BATCH]: this.batchQueue,
			[XPERT_HANDOFF_QUEUE_INTEGRATION]: this.integrationQueue
		}
	}

	async enqueue(
		queueName: HandoffQueueName,
		message: HandoffMessage,
		options?: HandoffQueueEnqueueOptions
	) {
		await this.getQueue(queueName).add(XPERT_HANDOFF_JOB, message, {
			delay: Math.max(0, options?.delayMs ?? 0),
			removeOnComplete: true,
			removeOnFail: false
		})
	}

	async enqueueMany(items: HandoffQueueEnqueueItem[]) {
		for (const item of items) {
			await this.enqueue(item.queueName, item.message, item.options)
		}
	}

	async findJobs(
		matcher: (message: HandoffMessage) => boolean,
		states: HandoffQueueScannableJobState[] = DEFAULT_SCAN_STATES
	): Promise<HandoffQueueMatchedJob[]> {
		const normalizedStates = Array.from(new Set(states))
		const matches: HandoffQueueMatchedJob[] = []

		for (const queueName of XPERT_HANDOFF_QUEUES) {
			const queue = this.getQueue(queueName)
			for (const state of normalizedStates) {
				const jobs = await queue.getJobs([state], 0, -1, true)
				for (const job of jobs) {
					if (matcher(job.data)) {
						matches.push({ queueName, state, job })
					}
				}
			}
		}

		return matches
	}

	async removeJobs(matches: HandoffQueueMatchedJob[]): Promise<HandoffQueueRemovedJob[]> {
		const removed: HandoffQueueRemovedJob[] = []
		for (const item of matches) {
			const job = item.job
			try {
				await job.remove()
				removed.push({
					queueName: item.queueName,
					state: item.state,
					jobId: String(job.id),
					message: job.data
				})
			} catch (error) {
				this.#logger.warn(
					`Failed to remove handoff queue job "${String(job.id)}" from "${item.queueName}": ${
						(error as Error)?.message ?? error
					}`
				)
			}
		}
		return removed
	}

	private getQueue(queueName: HandoffQueueName): Queue<HandoffMessage> {
		return this.#queueByName[queueName]
	}
}
