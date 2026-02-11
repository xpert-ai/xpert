import { applyDecorators, Injectable, Logger, SetMetadata } from '@nestjs/common'
import { STRATEGY_META_KEY } from '@xpert-ai/plugin-sdk'
import {
	CoreHandoffMessage,
	CoreHandoffProcessContext,
	CoreHandoffProcessResult,
	HandoffLaneName
} from '@xpert-ai/plugin-sdk'
import { LarkConversationService } from './conversation.service'
import { LarkChannelRuntimeManager } from './lark-channel-runtime.manager'
import {
	DEFAULT_LARK_HANDOFF_RETRY_DELAY_MS,
	LARK_HANDOFF_MESSAGE_TYPE,
	LARK_HANDOFF_XPERT_TYPE
} from './lark-handoff.constants'
import { LarkHandoffTask } from './lark-handoff.types'

const HANDOFF_PROCESSOR_META = 'XPERT_HANDOFF_PROCESSOR_META'
const HANDOFF_PROCESSOR_STRATEGY = 'XPERT_HANDOFF_PROCESSOR_STRATEGY'

interface HandoffProcessorMetadata {
	types: string[]
	policy: {
		lane: HandoffLaneName
		timeoutMs?: number
	}
}

function HandoffProcessor(metadata: HandoffProcessorMetadata) {
	return applyDecorators(
		SetMetadata(HANDOFF_PROCESSOR_META, metadata),
		SetMetadata(STRATEGY_META_KEY, HANDOFF_PROCESSOR_STRATEGY)
	)
}

@Injectable()
@HandoffProcessor({
	types: [LARK_HANDOFF_MESSAGE_TYPE, LARK_HANDOFF_XPERT_TYPE],
	policy: {
		lane: 'main'
	}
})
export class LarkHandoffTaskProcessor {
	private readonly logger = new Logger(LarkHandoffTaskProcessor.name)

	constructor(
		private readonly conversationService: LarkConversationService,
		private readonly channelRuntimeManager: LarkChannelRuntimeManager
	) {}

	async process(
		message: CoreHandoffMessage,
		ctx: CoreHandoffProcessContext
	): Promise<CoreHandoffProcessResult> {
		const task = message.payload?.task as LarkHandoffTask | undefined
		if (!task) {
			return {
				status: 'dead',
				reason: 'Missing lark handoff task payload'
			}
		}

		if (
			!this.channelRuntimeManager.isAccountRunning(
				'lark',
				task.integrationId,
				task.accountId
			)
		) {
			this.logger.warn(
				`Skip Lark handoff task for stopped account: kind=${task.kind}, integration=${task.integrationId}, account=${task.accountId}`
			)
			return { status: 'ok' }
		}

		try {
			await this.conversationService.processQueuedTask(task, {
				runId: ctx.runId,
				abortSignal: ctx.abortSignal
			})
			return { status: 'ok' }
		} catch (error) {
			const reason = error instanceof Error ? error.message : `${error}`
			this.channelRuntimeManager.noteAccountError(
				'lark',
				task.integrationId,
				task.accountId,
				error
			)

			if (isPermanentTaskError(reason)) {
				return {
					status: 'dead',
					reason
				}
			}

			return {
				status: 'retry',
				delayMs:
					parseInt(process.env.LARK_TASK_RETRY_DELAY_MS || '', 10) ||
					DEFAULT_LARK_HANDOFF_RETRY_DELAY_MS,
				reason
			}
		}
	}
}

function isPermanentTaskError(reason: string): boolean {
	const normalized = reason.toLowerCase()
	return (
		reason.includes('Missing tenantId for local handoff task') ||
		reason.includes('Missing request context for core chat api') ||
		reason.includes("Cannot read properties of null (reading 'email')") ||
		normalized.includes('requested record was not found')
	)
}
