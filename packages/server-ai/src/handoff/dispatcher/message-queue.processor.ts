import { Process, Processor } from '@nestjs/bull'
import { Injectable, Logger } from '@nestjs/common'
import { Job } from 'bull'
import { HandoffMessage, ProcessResult } from '../processor/processor.interface'
import { MessageDispatcherService } from './message-dispatcher.service'
import { DEFAULT_HANDOFF_MAX_ATTEMPTS, XPERT_HANDOFF_JOB, XPERT_HANDOFF_QUEUE } from './constants'
import { HandoffDeadLetterService } from './dead-letter.service'
import { HandoffQueueService } from './message-queue.service'
import { HandoffPendingResultService } from './pending-result.service'

const HANDOFF_DISPATCHER_CONCURRENCY =
	parseInt(process.env.XPERT_HANDOFF_DISPATCHER_CONCURRENCY || '', 10) || 20

@Processor(XPERT_HANDOFF_QUEUE)
@Injectable()
export class HandoffQueueProcessor {
	readonly #logger = new Logger(HandoffQueueProcessor.name)

	constructor(
		private readonly dispatcher: MessageDispatcherService,
		private readonly queueService: HandoffQueueService,
		private readonly deadLetterService: HandoffDeadLetterService,
		private readonly pendingResults: HandoffPendingResultService
	) {}

	@Process({
		name: XPERT_HANDOFF_JOB,
		concurrency: HANDOFF_DISPATCHER_CONCURRENCY
	})
	async process(job: Job<HandoffMessage>) {
		const message = job.data
		if (!message?.id) {
			throw new Error('Handoff message id is required')
		}

		try {
			const result = await this.dispatcher.dispatch(message)
			await this.handleResult(message, result)
		} catch (error) {
			await this.handleError(message, error)
		}
	}

	private async handleResult(message: HandoffMessage, result: ProcessResult) {
		switch (result.status) {
			case 'ok': {
				if (result.outbound?.length) {
					await this.queueService.enqueueMany(result.outbound)
				}
				this.pendingResults.resolve(message.id, result)
				return
			}
			case 'retry': {
				const nextAttempt = (message.attempt ?? 1) + 1
				if (nextAttempt > this.getMaxAttempts(message)) {
					const reason =
						result.reason || `Retry exhausted after ${this.getMaxAttempts(message)} attempts`
					await this.deadLetterService.record(message, reason)
					this.pendingResults.resolve(message.id, {
						status: 'dead',
						reason
					})
					return
				}

				await this.queueService.enqueue(
					{
						...message,
						attempt: nextAttempt
					},
					{
						delayMs: Math.max(0, result.delayMs || 0)
					}
				)
				return
			}
			case 'dead': {
				await this.deadLetterService.record(message, result.reason)
				this.pendingResults.resolve(message.id, result)
				return
			}
		}
	}

	private async handleError(message: HandoffMessage, error: unknown) {
		const reason = this.getErrorMessage(error)
		if (this.isPermanentError(reason)) {
			await this.deadLetterService.record(message, reason)
			this.pendingResults.resolve(message.id, {
				status: 'dead',
				reason
			})
			return
		}

		const nextAttempt = (message.attempt ?? 1) + 1
		if (nextAttempt <= this.getMaxAttempts(message)) {
			this.#logger.warn(
				`Dispatch failed for message ${message.id}, retrying (${nextAttempt}/${this.getMaxAttempts(
					message
				)}): ${reason}`
			)
			await this.queueService.enqueue({
				...message,
				attempt: nextAttempt
			})
			return
		}

		await this.deadLetterService.record(message, reason)
		this.pendingResults.reject(message.id, error)
	}

	private getMaxAttempts(message: HandoffMessage): number {
		return Math.max(1, message.maxAttempts ?? DEFAULT_HANDOFF_MAX_ATTEMPTS)
	}

	private isPermanentError(reason: string): boolean {
		return (
			reason.includes('No handoff processor found') ||
			reason.includes('Invalid handoff message:') ||
			reason.includes('Handoff message id is required')
		)
	}

	private getErrorMessage(error: unknown): string {
		if (error instanceof Error) {
			return error.message
		}
		if (typeof error === 'string') {
			return error
		}
		return 'Unknown handoff dispatch error'
	}
}
