import { Logger } from '@nestjs/common'
import z from 'zod'
import { CreateXpertTaskCommand } from '../../../../../xpert-task/'
import { ToolParameterValidationError } from '../../../../errors'
import { BuiltinTool } from '../../builtin-tool'
import { TaskToolset } from '../task'
import { TaskToolEnum } from '../types'
import { LangGraphRunnableConfig } from '@langchain/langgraph'
import { CallbackManagerForToolRun } from '@langchain/core/callbacks/manager'

export type TTaskCreateToolParameters = {
	name: string
	schedule: string
	agentKey: string
	prompt: string
}

export class TaskCreateTool extends BuiltinTool {
	readonly #logger = new Logger(TaskCreateTool.name)

	static lc_name(): string {
		return TaskToolEnum.CREATE_TASK
	}
	name = TaskToolEnum.CREATE_TASK
	description = 'A tool for creating a scheduled task'

	schema = z.object({
		name: z.string().describe(`task name`),
		schedule: z.string().describe(`cron expression`),
		agentKey: z.string().optional().describe(`agent key`),
		prompt: z.string().describe(`Task description`),
	})

	constructor(private toolset: TaskToolset) {
		super()
	}

	async _call(parameters: TTaskCreateToolParameters, callbacks: CallbackManagerForToolRun, config: LangGraphRunnableConfig) {
		if (!parameters.name) {
			throw new ToolParameterValidationError(`name is empty`)
		}

		const { subscriber } = config?.configurable ?? {}
		
		const cronRegex =
			/(@(annually|yearly|monthly|weekly|daily|hourly|reboot))|(@every (\d+(ns|us|µs|ms|s|m|h))+)|((((\d+,)+\d+|(\d+(\/|-)\d+)|\d+|\*) ?){5,7})/
		if (!cronRegex.test(parameters.schedule)) {
			throw new ToolParameterValidationError(`Invalid schedule (cron expression) format`)
		}

		const tasks = await this.toolset.commandBus.execute(new CreateXpertTaskCommand({
			...parameters,
			xpertId: this.toolset.xpertId,
		}))

		this.toolset.sendTasks(subscriber, tasks, 'en-US')

		return 'Task creation completed!'
	}
}
