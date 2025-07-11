import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { ChatMessageEventTypeEnum, ChatMessageStepCategory, getToolCallFromConfig, IXpertTask } from '@metad/contracts'
import { omit } from '@metad/server-common'
import { t } from 'i18next'
import z from 'zod'
import { QueryXpertTaskCommand } from '../../../../../xpert-task/'
import { BuiltinTool } from '../../builtin-tool'
import { TaskToolset } from '../task'
import { TaskToolEnum } from '../types'

export type TTaskListToolParameters = {
	//
}

export class TaskListTool extends BuiltinTool {
	static lc_name(): string {
		return TaskToolEnum.LIST_TASK
	}
	name = TaskToolEnum.LIST_TASK
	description = 'A tool for listing scheduled tasks'

	schema = z.object({})

	constructor(private toolset: TaskToolset) {
		super()
	}

	async _call(parameters: TTaskListToolParameters, callbacks, config) {
		const { subscriber } = config?.configurable ?? {}

		const tasks = await this.toolset.commandBus.execute<QueryXpertTaskCommand, IXpertTask[]>(
			new QueryXpertTaskCommand(this.toolset.xpertId)
		)

		const toolCall = getToolCallFromConfig(config)
		dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
			id: toolCall?.id,
			category: 'Computer',
			type: ChatMessageStepCategory.WebSearch,
			toolset: TaskToolset.provider,
			title: t('server-ai:Tools.Task.ScheduledTask'),
			data: tasks.map((task) => ({
				title: task.name,
				content: task.prompt,
				url: `/chat/tasks/${task.id}`
			}))
		}).catch((err) => {
			console.error(err)
		})

		return JSON.stringify(tasks.map((_) => omit(_, 'job')))
	}
}
