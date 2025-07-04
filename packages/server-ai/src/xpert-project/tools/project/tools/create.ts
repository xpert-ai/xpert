import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { tool } from '@langchain/core/tools'
import {
	ChatMessageEventTypeEnum,
	ChatMessageStepCategory,
	getToolCallFromConfig,
	IXpertProjectTask,
	TAgentRunnableConfigurable,
} from '@metad/contracts'
import { z } from 'zod'
import { XpertProjectTaskService } from '../../../services'
import { ProjectToolEnum } from '../project'

export const createCreateTasksTool = ({
	projectId,
	service
}: {
	projectId: string
	service: XpertProjectTaskService
}) => {
	const createTasksTool = tool(
		async (_, config) => {
			const { configurable } = config ?? {}
			const { subscriber, thread_id } = <TAgentRunnableConfigurable>configurable ?? {}
			const toolCall = getToolCallFromConfig(config)
			
			const tasks = await service.saveAll(
				..._.tasks.map(
					(task) =>
						({
							...task,
							threadId: thread_id,
							projectId,
							status: 'in_progress',
							steps: task.steps?.map((step, i) => ({ ...step, stepIndex: i + 1, status: 'pending' }))
						}) as IXpertProjectTask
				)
			)

			// Tool message event
			await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
				id: toolCall?.id,
				category: 'Computer',
				type: ChatMessageStepCategory.Tasks,
				toolset: 'project',
				tool: 'project_create_tasks',
				message: _.tasks.map((_) => _.name).join('\n\n'),
				title: await service.translate('xpert.Project.CreatingTasks'),
				data: tasks
			})
			return `Tasks created!`
		},
		{
			name: ProjectToolEnum.CreateTasks,
			schema: z.object({
				tasks: z
					.array(
						z.object({
							name: z.string().describe(`Task name`),
							type: z.enum(['research', 'report', 'deploy']).describe(`Task type`),
							steps: z.array(
								z.object({
									description: z.string().describe('Description of individual step')
								})
							)
						})
					)
					.describe('Tasks to create')
			}),
			description: 'Create tasks in project.'
		}
	)
	return createTasksTool
}
