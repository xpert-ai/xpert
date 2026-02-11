import { Injectable } from '@nestjs/common'
import { ExecutionQueueService } from '../execution-queue.service'
import { HandoffMessage, ProcessResult } from '../processor/processor.interface'
import { HandoffProcessorRegistry } from '../processor/processor.registry'
import { HandoffPendingResultService } from './pending-result.service'

@Injectable()
export class MessageDispatcherService {
	constructor(
		private readonly processorRegistry: HandoffProcessorRegistry,
		private readonly executionQueue: ExecutionQueueService,
		private readonly pendingResults: HandoffPendingResultService
	) {}

	async dispatch(message: HandoffMessage): Promise<ProcessResult> {
		this.assertMessage(message)

		const resolved = this.processorRegistry.resolve(message.type, message.organizationId)
		const runId = message.id || this.executionQueue.generateRunId()
		const lane = message.requestedLane ?? resolved.metadata.policy.lane
		const timeoutMs = resolved.metadata.policy.timeoutMs
		const abortController = new AbortController()

		return this.executionQueue.run({
			runId,
			sessionKey: message.sessionKey,
			globalLane: lane,
			abortController,
			source: message.source || 'api',
			conversationId: message.conversationId,
			executionId: this.extractExecutionId(message),
			integrationId: this.extractIntegrationId(message),
			userId: message.userId,
			tenantId: message.tenantId,
			timeoutMs,
			task: async (signal) => {
				return resolved.processor.process(message, {
					runId,
					traceId: message.traceId,
					abortSignal: signal ?? abortController.signal,
					emit: (event) => {
						this.pendingResults.publish(message.id, event)
					}
				})
			}
		})
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

	private extractExecutionId(message: HandoffMessage): string | undefined {
		const payloadExecutionId = message.payload?.executionId
		if (typeof payloadExecutionId === 'string' && payloadExecutionId) {
			return payloadExecutionId
		}
		return undefined
	}

	private extractIntegrationId(message: HandoffMessage): string | undefined {
		const payloadIntegrationId = message.payload?.integrationId
		if (typeof payloadIntegrationId === 'string' && payloadIntegrationId) {
			return payloadIntegrationId
		}
		const headerIntegrationId = message.headers?.integrationId
		if (typeof headerIntegrationId === 'string' && headerIntegrationId) {
			return headerIntegrationId
		}
		return undefined
	}
}
