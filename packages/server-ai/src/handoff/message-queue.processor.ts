import { Process, Processor } from '@nestjs/bull'
import { Injectable, Logger } from '@nestjs/common'
import { Job } from 'bull'
import { HandoffQueueService } from './message-queue.service'
import { HandoffMessage, ProcessResult } from '@xpert-ai/plugin-sdk'
import {
	DEFAULT_HANDOFF_MAX_ATTEMPTS,
	XPERT_HANDOFF_JOB,
	XPERT_HANDOFF_QUEUE,
	XPERT_HANDOFF_QUEUE_BATCH,
	XPERT_HANDOFF_QUEUE_INTEGRATION,
	XPERT_HANDOFF_QUEUE_REALTIME
} from './constants'
import { MessageDispatcherService } from './message-dispatcher.service'
import { HandoffPendingResultService } from './pending-result.service'
import { HandoffDeadService } from './dead-letter.service'
import { buildCanceledReason, isAbortLikeError, isCanceledReason } from './cancel-reason'

const DEFAULT_HANDOFF_DISPATCHER_CONCURRENCY =
	parseInt(process.env.XPERT_HANDOFF_DISPATCHER_CONCURRENCY || '', 10) || 20

const HANDOFF_DISPATCHER_CONCURRENCY_REALTIME =
	parseInt(process.env.XPERT_HANDOFF_CONCURRENCY_REALTIME || '', 10) ||
	DEFAULT_HANDOFF_DISPATCHER_CONCURRENCY

const HANDOFF_DISPATCHER_CONCURRENCY_BATCH =
	parseInt(process.env.XPERT_HANDOFF_CONCURRENCY_BATCH || '', 10) ||
	DEFAULT_HANDOFF_DISPATCHER_CONCURRENCY

const HANDOFF_DISPATCHER_CONCURRENCY_INTEGRATION =
	parseInt(process.env.XPERT_HANDOFF_CONCURRENCY_INTEGRATION || '', 10) ||
	DEFAULT_HANDOFF_DISPATCHER_CONCURRENCY

abstract class BaseHandoffQueueProcessor {
	readonly #logger: Logger

	constructor(
		loggerContext: string,
		private readonly dispatcher: MessageDispatcherService,
		private readonly queueService: HandoffQueueService,
		private readonly deadLetterService: HandoffDeadService,
		private readonly pendingResults: HandoffPendingResultService
	) {
		this.#logger = new Logger(loggerContext)
	}

	protected async processMessage(job: Job<HandoffMessage>) {
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
				if (!isCanceledReason(result.reason)) {
					await this.deadLetterService.record(message, result.reason)
				}
				this.pendingResults.resolve(message.id, result)
				return
			}
		}
	}

	private async handleError(message: HandoffMessage, error: unknown) {
		const reason = this.getErrorMessage(error)
		if (isCanceledReason(reason) || isAbortLikeError(error)) {
			this.pendingResults.resolve(message.id, {
				status: 'dead',
				reason: isCanceledReason(reason) ? reason : buildCanceledReason(reason)
			})
			return
		}
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

@Processor(XPERT_HANDOFF_QUEUE)
@Injectable()
export class HandoffQueueProcessor extends BaseHandoffQueueProcessor {
	constructor(
		dispatcher: MessageDispatcherService,
		queueService: HandoffQueueService,
		deadLetterService: HandoffDeadService,
		pendingResults: HandoffPendingResultService
	) {
		super(HandoffQueueProcessor.name, dispatcher, queueService, deadLetterService, pendingResults)
	}

	@Process({
		name: XPERT_HANDOFF_JOB,
		concurrency: DEFAULT_HANDOFF_DISPATCHER_CONCURRENCY
	})
	async process(job: Job<HandoffMessage>) {
		await this.processMessage(job)
	}
}

@Processor(XPERT_HANDOFF_QUEUE_REALTIME)
@Injectable()
export class HandoffQueueRealtimeProcessor extends BaseHandoffQueueProcessor {
	constructor(
		dispatcher: MessageDispatcherService,
		queueService: HandoffQueueService,
		deadLetterService: HandoffDeadService,
		pendingResults: HandoffPendingResultService
	) {
		super(
			HandoffQueueRealtimeProcessor.name,
			dispatcher,
			queueService,
			deadLetterService,
			pendingResults
		)
	}

	@Process({
		name: XPERT_HANDOFF_JOB,
		concurrency: HANDOFF_DISPATCHER_CONCURRENCY_REALTIME
	})
	async process(job: Job<HandoffMessage>) {
		await this.processMessage(job)
	}
}

@Processor(XPERT_HANDOFF_QUEUE_BATCH)
@Injectable()
export class HandoffQueueBatchProcessor extends BaseHandoffQueueProcessor {
	constructor(
		dispatcher: MessageDispatcherService,
		queueService: HandoffQueueService,
		deadLetterService: HandoffDeadService,
		pendingResults: HandoffPendingResultService
	) {
		super(HandoffQueueBatchProcessor.name, dispatcher, queueService, deadLetterService, pendingResults)
	}

	@Process({
		name: XPERT_HANDOFF_JOB,
		concurrency: HANDOFF_DISPATCHER_CONCURRENCY_BATCH
	})
	async process(job: Job<HandoffMessage>) {
		await this.processMessage(job)
	}
}

@Processor(XPERT_HANDOFF_QUEUE_INTEGRATION)
@Injectable()
export class HandoffQueueIntegrationProcessor extends BaseHandoffQueueProcessor {
	constructor(
		dispatcher: MessageDispatcherService,
		queueService: HandoffQueueService,
		deadLetterService: HandoffDeadService,
		pendingResults: HandoffPendingResultService
	) {
		super(
			HandoffQueueIntegrationProcessor.name,
			dispatcher,
			queueService,
			deadLetterService,
			pendingResults
		)
	}

	@Process({
		name: XPERT_HANDOFF_JOB,
		concurrency: HANDOFF_DISPATCHER_CONCURRENCY_INTEGRATION
	})
	async process(job: Job<HandoffMessage>) {
		await this.processMessage(job)
	}
}
