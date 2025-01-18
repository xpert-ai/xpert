import { IXpertTask } from '@metad/contracts'
import { omit } from '@metad/server-common'
import z from 'zod'
import { QueryXpertTaskCommand } from '../../../../../xpert-task/'
import { BuiltinTool } from '../../builtin-tool'
import { TaskToolset } from '../task'
import { TaskToolEnum } from '../types'

export type TTaskListToolParameters = {
	name?: string
}

export class TaskListTool extends BuiltinTool {
	static lc_name(): string {
		return TaskToolEnum.LIST_TASK
	}
	name = TaskToolEnum.LIST_TASK
	description = 'A tool for listing scheduled tasks'

	schema = z.object({
		name: z.string().optional().describe(`task name`)
	})

	constructor(private toolset: TaskToolset) {
		super()
	}

	async _call(parameters: TTaskListToolParameters, callbacks, config) {
		const { subscriber } = config?.configurable ?? {}

		const tasks = await this.toolset.commandBus.execute<QueryXpertTaskCommand, IXpertTask[]>(
			new QueryXpertTaskCommand(parameters.name)
		)

		this.toolset.sendTasks(
			subscriber,
			tasks.map((job) => omit(job, 'job')),
			'en-US'
		)

		return tasks.map((_) => omit(_, 'job'))
	}
}
