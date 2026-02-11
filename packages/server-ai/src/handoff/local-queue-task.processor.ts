import { Injectable } from '@nestjs/common'
import { runWithRequestContext } from '@metad/server-core'
import { HandoffProcessor } from './processor/processor.decorator'
import {
	HandoffMessage,
	IHandoffProcessor,
	ProcessContext,
	ProcessResult
} from './processor/processor.interface'
import { LocalQueueTaskService, SYSTEM_LOCAL_TASK_MESSAGE_TYPE } from './local-queue-task.service'

@Injectable()
@HandoffProcessor({
	types: [SYSTEM_LOCAL_TASK_MESSAGE_TYPE],
	policy: {
		lane: 'main'
	}
})
export class LocalQueueTaskProcessor implements IHandoffProcessor {
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
		const requestContext = message.payload?.requestContext as
			| {
					user?: any
					headers?: Record<string, string>
			  }
			| undefined

		if (!requestContext) {
			return task()
		}

		return new Promise<void | ProcessResult>((resolve, reject) => {
			runWithRequestContext(
				{
					user: requestContext.user,
					headers: requestContext.headers ?? {}
				},
				() => {
					task().then(resolve).catch(reject)
				}
			)
		})
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
