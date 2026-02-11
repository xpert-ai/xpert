import { randomUUID } from 'crypto'
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { CoreHandoffMessage } from '@xpert-ai/plugin-sdk'
import {
	DEFAULT_LARK_HANDOFF_MAX_ATTEMPTS,
	LARK_HANDOFF_MESSAGE_TYPE,
	LARK_HANDOFF_XPERT_TYPE
} from './lark-handoff.constants'
import { LarkCoreApi } from './lark-core-api.service'
import {
	LarkHandoffMessageTask,
	LarkHandoffTask,
	LarkHandoffXpertTask
} from './lark-handoff.types'

type LarkQueueInfo = {
	mode: 'core-handoff'
	orderingScope: 'process-local'
	distributedSafe: false
}

@Injectable()
export class LarkExecutionQueueService implements OnModuleDestroy {
	private readonly logger = new Logger(LarkExecutionQueueService.name)

	constructor(private readonly core: LarkCoreApi) {
		this.logger.log(
			'Lark queue delegated to core handoff queue; account lifecycle and cancel bookkeeping remain process-local.'
		)
	}

	onModuleDestroy() {
		// No local timers/resources. Core handoff lifecycle is managed by server-ai module.
	}

	async enqueueMessageTask(task: LarkHandoffMessageTask): Promise<string> {
		const message = this.buildMessage(LARK_HANDOFF_MESSAGE_TYPE, task)
		const result = await this.core.handoff.enqueue(message)
		return result.id
	}

	async enqueueXpertTask(task: LarkHandoffXpertTask): Promise<string> {
		const message = this.buildMessage(LARK_HANDOFF_XPERT_TYPE, task)
		const result = await this.core.handoff.enqueue(message)
		return result.id
	}

	abortByRunId(runId: string, reason?: string): boolean {
		return this.core.handoff.abortByRunId(runId, reason)
	}

	abortBySessionKey(sessionKey: string, reason?: string): string[] {
		return this.core.handoff.abortBySessionKey(sessionKey, reason)
	}

	abortByAccount(accountKey: string, reason?: string): string[] {
		return this.core.handoff.abortByIntegration(accountKey, reason)
	}

	getAccountRunCount(accountKey: string): number {
		return this.core.handoff.getIntegrationRunCount(accountKey)
	}

	getAccountRunIds(accountKey: string): string[] {
		return this.core.handoff.getIntegrationRunIds(accountKey)
	}

	getQueueInfo(): LarkQueueInfo {
		return {
			mode: 'core-handoff',
			orderingScope: 'process-local',
			distributedSafe: false
		}
	}

	private buildMessage(type: string, task: LarkHandoffTask): CoreHandoffMessage {
		const id = randomUUID()
		return {
			id,
			type,
			version: 1,
			tenantId: task.tenantId,
			organizationId: task.organizationId,
			userId: task.user?.id,
			sessionKey: task.sessionKey,
			businessKey: this.resolveBusinessKey(type, task, id),
			attempt: 1,
			maxAttempts:
				parseInt(process.env.LARK_TASK_MAX_ATTEMPTS || '', 10) ||
				DEFAULT_LARK_HANDOFF_MAX_ATTEMPTS,
			enqueuedAt: Date.now(),
			traceId: id,
			source: 'lark',
			requestedLane: 'main',
			payload: {
				integrationId: task.accountKey,
				task
			},
			headers: {
				integrationId: task.accountKey,
				accountId: task.accountId
			}
		}
	}

	private resolveBusinessKey(type: string, task: LarkHandoffTask, fallback: string): string {
		if (task.kind === 'message') {
			const messageId = (task.payload as any)?.message?.message?.message_id
			if (messageId && typeof messageId === 'string') {
				return `${type}:${task.integrationId}:${task.accountId}:${messageId}`
			}
		}
		return `${type}:${task.integrationId}:${task.accountId}:${fallback}`
	}
}
