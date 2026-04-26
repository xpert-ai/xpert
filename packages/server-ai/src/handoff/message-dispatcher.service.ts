import { Injectable, Optional } from '@nestjs/common'
import { HandoffPendingResultService } from './pending-result.service'
import { getErrorMessage, HandoffMessage, HandoffProcessorRegistry, ProcessResult } from '@xpert-ai/plugin-sdk'
import { HandoffCancelService } from './handoff-cancel.service'
import { buildCanceledReason, isAbortLikeError } from './cancel-reason'
import { XPERT_EVENT_TYPES } from '@xpert-ai/contracts'
import { XpertEventPublisher } from '../event-system'

@Injectable()
export class MessageDispatcherService {
	constructor(
		private readonly processorRegistry: HandoffProcessorRegistry,
		private readonly pendingResults: HandoffPendingResultService,
		private readonly handoffCancelService: HandoffCancelService,
		@Optional() private readonly eventPublisher?: XpertEventPublisher
	) {}

	async dispatch(message: HandoffMessage): Promise<ProcessResult> {
		this.assertMessage(message)

		const organizationId = this.getOrganizationId(message)
		const resolved = this.processorRegistry.get(message.type, organizationId)
		const runId = message.id
		const abortController = new AbortController()
		this.handoffCancelService.register(runId, abortController)
		this.publishHandoffLifecycle(XPERT_EVENT_TYPES.HandoffStarted, message)

		try {
			const result = await resolved.process(message, {
				runId,
				traceId: message.traceId,
				abortSignal: abortController.signal,
				emit: (event) => {
					this.pendingResults.publish(message.id, event)
				}
			})
			if (abortController.signal.aborted) {
				this.publishHandoffLifecycle(XPERT_EVENT_TYPES.HandoffFailed, message, {
					status: 'dead',
					reason: this.resolveCanceledReason(runId)
				})
				return {
					status: 'dead',
					reason: this.resolveCanceledReason(runId)
				}
			}
			this.publishHandoffLifecycle(
				result.status === 'ok' ? XPERT_EVENT_TYPES.HandoffCompleted : XPERT_EVENT_TYPES.HandoffFailed,
				message,
				result
			)
			return result
		} catch (error) {
			if (abortController.signal.aborted || isAbortLikeError(error)) {
				this.publishHandoffLifecycle(XPERT_EVENT_TYPES.HandoffFailed, message, {
					status: 'dead',
					reason: this.resolveCanceledReason(runId, error)
				})
				return {
					status: 'dead',
					reason: this.resolveCanceledReason(runId, error)
				}
			}
			this.publishHandoffLifecycle(XPERT_EVENT_TYPES.HandoffFailed, message, {
				status: 'dead',
				reason: getErrorMessage(error)
			})
			throw error
		} finally {
			this.handoffCancelService.unregister(runId)
		}
	}

	private resolveCanceledReason(messageId: string, error?: unknown): string {
		const reason = this.handoffCancelService.getCancelReason(messageId)
		if (reason) {
			return reason
		}
		return buildCanceledReason(getErrorMessage(error))
	}

	private assertMessage(message: HandoffMessage) {
		if (!message) {
			throw new Error('Invalid handoff message: message is required')
		}
		if (!message.id) {
			throw new Error('Invalid handoff message: id is required')
		}
		if (!message.type) {
			throw new Error('Invalid handoff message: type is required')
		}
		if (!message.tenantId) {
			throw new Error('Invalid handoff message: tenantId is required')
		}
		if (!message.sessionKey) {
			throw new Error('Invalid handoff message: sessionKey is required')
		}
		if (!message.traceId) {
			throw new Error('Invalid handoff message: traceId is required')
		}
		if (!message.businessKey) {
			throw new Error('Invalid handoff message: businessKey is required')
		}
	}

	private getOrganizationId(message: HandoffMessage): string | undefined {
		return this.getHeader(message, 'organizationId')
	}

	private getHeader(message: HandoffMessage, key: string): string | undefined {
		const value = message.headers?.[key]
		if (typeof value === 'string' && value.length > 0) {
			return value
		}
		return undefined
	}

	private publishHandoffLifecycle(type: string, message: HandoffMessage, result?: ProcessResult) {
		this.eventPublisher
			?.publish({
				type,
				source: {
					type: 'handoff',
					id: message.id
				},
				payload: {
					messageId: message.id,
					messageType: message.type,
					sessionKey: message.sessionKey,
					businessKey: message.businessKey,
					attempt: message.attempt,
					maxAttempts: message.maxAttempts,
					resultStatus: result?.status,
					reason: result && 'reason' in result ? result.reason : undefined,
					delayMs: result && 'delayMs' in result ? result.delayMs : undefined,
					parentMessageId: message.parentMessageId
				},
				meta: {
					tenantId: message.tenantId,
					organizationId: message.headers?.organizationId ?? null,
					userId: message.headers?.userId ?? null,
					traceId: message.traceId
				}
			})
			.catch(() => null)
	}
}
