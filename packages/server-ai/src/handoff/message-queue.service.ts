import { Injectable } from '@nestjs/common'
import {
	HandoffEnqueueAndWaitOptions,
	HandoffEnqueueOptions,
	HandoffMessage,
	HandoffPermissionService,
	ProcessResult,
	RequirePermissionOperation
} from '@xpert-ai/plugin-sdk'
import { randomUUID } from 'crypto'
import { HandoffPendingResultService } from './pending-result.service'
import { DEFAULT_HANDOFF_MAX_ATTEMPTS } from './constants'
import {
	HandoffRouteResolution,
	HandoffRouteResolver
} from './dispatcher/handoff-route-resolver.service'
import {
	HandoffQueueEnqueueItem,
	HandoffQueueGatewayService
} from './dispatcher/handoff-queue-gateway.service'

@Injectable()
export class HandoffQueueService implements HandoffPermissionService {
	constructor(
		private readonly queueGateway: HandoffQueueGatewayService,
		private readonly routeResolver: HandoffRouteResolver,
		private readonly pendingResults: HandoffPendingResultService
	) {}

	@RequirePermissionOperation('handoff', 'enqueue')
	async enqueue(message: HandoffMessage, options?: HandoffEnqueueOptions): Promise<{ id: string }> {
		const route = this.routeResolver.resolve(message)
		const normalized = this.normalize(message, route)
		await this.addJob(normalized, route, options)
		return { id: normalized.id }
	}

	async enqueueMany(messages: HandoffMessage[], options?: { delayMs?: number }): Promise<Array<{ id: string }>> {
		const queueItems = messages.map((message) => {
			const route = this.routeResolver.resolve(message)
			const normalized = this.normalize(message, route)
			return this.toQueueEnqueueItem(normalized, route, options)
		})
		await this.queueGateway.enqueueMany(queueItems)
		return queueItems.map((item) => ({ id: item.message.id }))
	}

	/**
	 * Enqueue a message and wait for local process completion callback.
	 * Best-effort only: if worker or waiter is on another instance, no callback will arrive.
	 */
	@RequirePermissionOperation('handoff', 'wait')
	async enqueueAndWait(
		message: HandoffMessage,
		options?: HandoffEnqueueAndWaitOptions
	): Promise<ProcessResult> {
		const route = this.routeResolver.resolve(message)
		const normalized = this.normalize(message, route)
		const waitPromise = this.pendingResults.waitFor<ProcessResult>(normalized.id, {
			timeoutMs: options?.timeoutMs,
			onEvent: options?.onEvent
		})
		try {
			await this.addJob(normalized, route, options)
		} catch (error) {
			this.pendingResults.reject(normalized.id, error)
			throw error
		}
		return waitPromise
	}

	private normalize(message: HandoffMessage, route: HandoffRouteResolution): HandoffMessage {
		const maxAttemptsFromTypePolicy = route.typePolicy?.retry?.maxAttempts
		return {
			...message,
			id: message.id || randomUUID(),
			version: message.version ?? 1,
			attempt: Math.max(1, message.attempt ?? 1),
			maxAttempts: Math.max(
				1,
				message.maxAttempts ?? maxAttemptsFromTypePolicy ?? DEFAULT_HANDOFF_MAX_ATTEMPTS
			),
			enqueuedAt: message.enqueuedAt ?? Date.now()
		}
	}

	private async addJob(
		message: HandoffMessage,
		route: HandoffRouteResolution,
		options?: { delayMs?: number }
	) {
		const queueItem = this.toQueueEnqueueItem(message, route, options)
		await this.queueGateway.enqueue(queueItem.queueName, queueItem.message, queueItem.options)
	}

	private toQueueEnqueueItem(
		message: HandoffMessage,
		route: HandoffRouteResolution,
		options?: { delayMs?: number }
	): HandoffQueueEnqueueItem {
		return {
			queueName: route.queue,
			message: this.withRouteHeaders(message, route),
			options
		}
	}

	private withRouteHeaders(message: HandoffMessage, route: HandoffRouteResolution): HandoffMessage {
		const headers: Record<string, string> = {
			...(message.headers ?? {}),
			requestedLane: message.headers?.requestedLane ?? route.lane,
			handoffQueue: route.queue
		}
		if (route.policy.timeoutMs && !headers['policyTimeoutMs']) {
			headers['policyTimeoutMs'] = String(route.policy.timeoutMs)
		}

		return {
			...message,
			headers: headers as HandoffMessage['headers']
		}
	}
}
