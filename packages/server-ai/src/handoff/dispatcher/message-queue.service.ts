import { randomUUID } from 'crypto'
import { InjectQueue } from '@nestjs/bull'
import { Injectable } from '@nestjs/common'
import { Queue } from 'bull'
import { HandoffMessage, ProcessResult } from '../processor/processor.interface'
import { DEFAULT_HANDOFF_MAX_ATTEMPTS, XPERT_HANDOFF_JOB, XPERT_HANDOFF_QUEUE } from './constants'
import { HandoffPendingResultService } from './pending-result.service'

@Injectable()
export class HandoffQueueService {
	constructor(
		@InjectQueue(XPERT_HANDOFF_QUEUE)
		private readonly queue: Queue<HandoffMessage>,
		private readonly pendingResults: HandoffPendingResultService
	) {}

	async enqueue(message: HandoffMessage, options?: { delayMs?: number }): Promise<{ id: string }> {
		const normalized = this.normalize(message)
		await this.addJob(normalized, options)
		return { id: normalized.id }
	}

	async enqueueMany(messages: HandoffMessage[], options?: { delayMs?: number }): Promise<Array<{ id: string }>> {
		const ids: Array<{ id: string }> = []
		for (const message of messages) {
			ids.push(await this.enqueue(message, options))
		}
		return ids
	}

	/**
	 * Enqueue a message and wait for local process completion callback.
	 * Best-effort only: if worker or waiter is on another instance, no callback will arrive.
	 */
	async enqueueAndWait(
		message: HandoffMessage,
		options?: {
			delayMs?: number
			timeoutMs?: number
			onEvent?: (event: unknown) => void
		}
	): Promise<ProcessResult> {
		const normalized = this.normalize(message)
		const waitPromise = this.pendingResults.waitFor<ProcessResult>(normalized.id, {
			timeoutMs: options?.timeoutMs,
			onEvent: options?.onEvent
		})
		try {
			await this.addJob(normalized, options)
		} catch (error) {
			this.pendingResults.reject(normalized.id, error)
			throw error
		}
		return waitPromise
	}

	private normalize(message: HandoffMessage): HandoffMessage {
		return {
			...message,
			id: message.id || randomUUID(),
			version: message.version ?? 1,
			attempt: Math.max(1, message.attempt ?? 1),
			maxAttempts: Math.max(1, message.maxAttempts ?? DEFAULT_HANDOFF_MAX_ATTEMPTS),
			enqueuedAt: message.enqueuedAt ?? Date.now()
		}
	}

	private async addJob(message: HandoffMessage, options?: { delayMs?: number }) {
		await this.queue.add(XPERT_HANDOFF_JOB, message, {
			delay: Math.max(0, options?.delayMs ?? 0),
			removeOnComplete: true,
			removeOnFail: false
		})
	}
}
