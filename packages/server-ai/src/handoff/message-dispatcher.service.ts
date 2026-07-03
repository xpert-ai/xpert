import { Injectable } from '@nestjs/common'
import { HandoffPendingResultService } from './pending-result.service'
import {
	getErrorMessage,
	HandoffMessage,
	HandoffProcessorRegistry,
	ProcessResult
} from '@xpert-ai/plugin-sdk'
import { HandoffCancelService } from './handoff-cancel.service'
import { buildCanceledReason, isAbortLikeError } from './cancel-reason'
import {
	getHandoffMessageOrganizationId,
	runWithHandoffMessageContext
} from './message-context'

@Injectable()
export class MessageDispatcherService {
	constructor(
		private readonly processorRegistry: HandoffProcessorRegistry,
		private readonly pendingResults: HandoffPendingResultService,
		private readonly handoffCancelService: HandoffCancelService
	) {}

	async dispatch(message: HandoffMessage): Promise<ProcessResult> {
		this.assertMessage(message)
		return runWithHandoffMessageContext(message, () => this.dispatchWithContext(message))
	}

	private async dispatchWithContext(message: HandoffMessage): Promise<ProcessResult> {
		const organizationId = this.getOrganizationId(message)
		const resolved = this.processorRegistry.get(message.type, organizationId)
		const runId = message.id
		const abortController = new AbortController()
		const timeoutPolicy = this.resolveTimeoutPolicy(message)
		let localAbortReason: string | undefined
		const abortWithReason = (reason: string) => {
			if (abortController.signal.aborted) {
				return
			}
			localAbortReason = reason
			abortController.abort()
		}
		const timeoutTimers = this.startTimeoutTimers(timeoutPolicy, abortWithReason)
		this.handoffCancelService.register(runId, abortController)

		try {
			const result = await resolved.process(message, {
				runId,
				traceId: message.traceId,
				abortSignal: abortController.signal,
				heartbeat: () => {
					timeoutTimers.heartbeat()
				},
				getAbortReason: () => this.resolveVisibleAbortReason(runId, localAbortReason),
				emit: (event) => {
					this.pendingResults.publish(message.id, event)
				}
			})
			if (abortController.signal.aborted) {
				return {
					status: 'dead',
					reason: this.resolveCanceledReason(runId, localAbortReason)
				}
			}
			return result
		} catch (error) {
			if (abortController.signal.aborted || isAbortLikeError(error)) {
				return {
					status: 'dead',
					reason: this.resolveCanceledReason(runId, localAbortReason, error)
				}
			}
			throw error
		} finally {
			timeoutTimers.clear()
			this.handoffCancelService.unregister(runId)
		}
	}

	private resolveCanceledReason(messageId: string, localAbortReason?: string, error?: unknown): string {
		const reason = this.handoffCancelService.getCancelReason(messageId)
		if (reason) {
			return reason
		}
		if (localAbortReason) {
			return buildCanceledReason(localAbortReason)
		}
		return buildCanceledReason(getErrorMessage(error))
	}

	private resolveVisibleAbortReason(messageId: string, localAbortReason?: string): string | undefined {
		const reason = this.handoffCancelService.getCancelReason(messageId)
		return this.stripCanceledReason(reason) ?? localAbortReason
	}

	private stripCanceledReason(reason?: string): string | undefined {
		const prefix = 'canceled:'
		if (!reason) {
			return undefined
		}
		return reason.startsWith(prefix) ? reason.slice(prefix.length) : reason
	}

	private resolveTimeoutPolicy(message: HandoffMessage): {
		timeoutMs?: number
		idleTimeoutMs?: number
	} {
		return {
			timeoutMs: this.parsePositiveIntegerHeader(message.headers?.policyTimeoutMs),
			idleTimeoutMs: this.parsePositiveIntegerHeader(message.headers?.policyIdleTimeoutMs)
		}
	}

	private parsePositiveIntegerHeader(value?: string): number | undefined {
		if (!value) {
			return undefined
		}
		const parsed = parseInt(value, 10)
		return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
	}

	private startTimeoutTimers(
		policy: { timeoutMs?: number; idleTimeoutMs?: number },
		abortWithReason: (reason: string) => void
	): {
		heartbeat: () => void
		clear: () => void
	} {
		let totalTimer: ReturnType<typeof setTimeout> | undefined
		let idleTimer: ReturnType<typeof setTimeout> | undefined

		const clearIdleTimer = () => {
			if (idleTimer) {
				clearTimeout(idleTimer)
				idleTimer = undefined
			}
		}
		const scheduleIdleTimer = () => {
			clearIdleTimer()
			if (!policy.idleTimeoutMs) {
				return
			}
			idleTimer = setTimeout(() => {
				abortWithReason(`Handoff idle timeout after ${policy.idleTimeoutMs}ms`)
			}, policy.idleTimeoutMs)
		}

		if (policy.timeoutMs) {
			totalTimer = setTimeout(() => {
				abortWithReason(`Handoff total timeout after ${policy.timeoutMs}ms`)
			}, policy.timeoutMs)
		}
		scheduleIdleTimer()

		return {
			heartbeat: () => {
				scheduleIdleTimer()
			},
			clear: () => {
				if (totalTimer) {
					clearTimeout(totalTimer)
					totalTimer = undefined
				}
				clearIdleTimer()
			}
		}
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
		return getHandoffMessageOrganizationId(message)
	}
}
