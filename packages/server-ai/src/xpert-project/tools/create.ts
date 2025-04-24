import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { tool } from '@langchain/core/tools'
import { ChatMessageEventTypeEnum, ChatMessageStepType, ChatMessageTypeEnum, IXpertProjectTask, TMessageContentComponent } from '@metad/contracts'
import { shortuuid } from '@metad/server-common'
import { z } from 'zod'
import { XpertProjectTaskService } from '../services/project-task.service'

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
			const { subscriber } = configurable ?? {}

			console.log(_)

			const tasks = await service.saveAll(
				..._.tasks.map(
					(task) =>
						({
							...task,
							projectId,
							status: 'in_progress',
							steps: task.steps?.map((step, i) => ({ ...step, stepIndex: i + 1, status: 'pending' }))
						}) as IXpertProjectTask
				)
			)

			// Tool message event
			await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
				type: ChatMessageStepType.ComputerUse,
				toolset: 'planning',
				tool: 'create_plan',
				message: _.tasks.map((_) => _.name).join('\n\n'),
				title: `Creating tasks`,
				data: {
					title: 'Tasks',
					plan_steps: _.tasks.map((_) => ({ ..._, content: _.name }))
				}
			})

			subscriber?.next({
				data: {
					type: ChatMessageTypeEnum.MESSAGE,
					data: {
						id: shortuuid(),
						type: 'component',
						data: {
							category: 'Computer',
							type: 'Tasks',
							tasks
						}
					} as TMessageContentComponent
				}
			} as MessageEvent)
			return `Tasks created!`
		},
		{
			name: `project_create_tasks`,
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
