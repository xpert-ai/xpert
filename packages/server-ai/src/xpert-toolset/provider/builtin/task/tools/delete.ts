import { IXpertTask } from '@metad/contracts'
import z from 'zod'
import { DeleteXpertTaskCommand } from '../../../../../xpert-task'
import { BuiltinTool } from '../../builtin-tool'
import { TaskToolset } from '../task'
import { TaskToolEnum } from '../types'

export type TTaskDeleteToolParameters = {
	name?: string
}

export class TaskDeleteTool extends BuiltinTool {
	static lc_name(): string {
		return TaskToolEnum.DELETE_TASK
	}
	name = TaskToolEnum.DELETE_TASK
	description = 'A tool for deleting a scheduled task'

	schema = z.object({
		name: z.string().optional().describe(`task name`)
	})

	constructor(private toolset: TaskToolset) {
		super()
	}

	async _call(parameters: TTaskDeleteToolParameters) {
		return await this.toolset.commandBus.execute<DeleteXpertTaskCommand, IXpertTask[]>(
			new DeleteXpertTaskCommand(parameters.name)
		)
	}
}
