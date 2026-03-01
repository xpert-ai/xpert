import { Injectable } from '@nestjs/common'
import {
	HandoffMessage,
	HandoffProcessorStrategy,
	IHandoffProcessor,
	ProcessContext,
	ProcessResult,
	runWithRequestContext
} from '@xpert-ai/plugin-sdk'
import { runWithRequestContext as _runWithRequestContext } from '@metad/server-core'
import {
	AGENT_CHAT_MESSAGE_TYPE,
	LocalQueueTaskService
} from '../../local-sync-task.service'

@Injectable()
@HandoffProcessorStrategy(AGENT_CHAT_MESSAGE_TYPE, {
	types: [AGENT_CHAT_MESSAGE_TYPE],
	policy: {
		lane: 'main'
	}
})
export class AgentChatHandoffProcessor implements IHandoffProcessor {
	constructor(private readonly localTaskService: LocalQueueTaskService) {}

	async process(message: HandoffMessage, ctx: ProcessContext): Promise<ProcessResult> {
		const taskId = message.payload?.taskId as string | undefined
		if (!taskId) {
			return {
				status: 'dead',
				reason: 'Missing local task id in message payload'
			}
		}

		const task = this.localTaskService.take(taskId)
		if (!task) {
			return {
				status: 'dead',
				reason: `Local task not found: ${taskId}`
			}
		}

		const runTask = () =>
			task({
				signal: ctx.abortSignal,
				emit: (event: unknown) => {
					ctx.emit?.(event)
				}
			})

		const output = await this.runTaskWithRequestContext(message, runTask)

		if (isProcessResult(output)) {
			return output
		}

		return { status: 'ok' }
	}

	private async runTaskWithRequestContext(
		message: HandoffMessage,
		task: () => Promise<void | ProcessResult>
	): Promise<void | ProcessResult> {
		const userId = this.toNonEmptyString(message.headers?.userId)
		const organizationId = this.toNonEmptyString(message.headers?.organizationId)
		const language = this.toNonEmptyString(message.headers?.language)
		if (!userId && !organizationId && !language) {
			return task()
		}

		const headers: Record<string, string> = {
			['tenant-id']: message.tenantId,
			...(organizationId ? { ['organization-id']: organizationId } : {}),
			...(language ? { language } : {})
		}
		const user = userId
			? {
					id: userId,
					tenantId: message.tenantId
				}
			: undefined

		return new Promise<void | ProcessResult>((resolve, reject) => {
			runWithRequestContext(
				{
					user,
					headers
				},
				null,
				() => {
					_runWithRequestContext(
						{
							user,
							headers
						},
						() => {
							task().then(resolve).catch(reject)
						}
					)
				}
			)
		})
	}

	private toNonEmptyString(value: unknown): string | undefined {
		return typeof value === 'string' && value.length > 0 ? value : undefined
	}
}

function isProcessResult(output: unknown): output is ProcessResult {
	return (
		typeof output === 'object' &&
		output !== null &&
		'status' in output &&
		typeof (output as { status?: unknown }).status === 'string'
	)
}
