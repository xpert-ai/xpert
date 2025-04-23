import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { XpertProjectTaskService } from '../services/project-task.service'
import { ChatMessageEventTypeEnum, ChatMessageStepType, IXpertProjectTask } from '@metad/contracts'
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'

export const createCreateTasksTool = ({
	projectId,
	service
}: {
	projectId: string
	service: XpertProjectTaskService
}) => {
	const createTasksTool = tool(
		async (_, config) => {
			console.log(_)
			await service.saveAll(..._.tasks.map((task) => ({...task, projectId, status: 'in_progress'} as IXpertProjectTask)))

			// Tool message event
			dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
				type: ChatMessageStepType.ComputerUse,
				toolset: 'planning',
				tool: 'create_plan',
				message: _.tasks.map((_) => _.name).join('\n\n'),
				title: `Creating tasks`,
				data: {
					title: 'Tasks',
					plan_steps: _.tasks.map((_) => ({..._, content: _.name,}))
				}
			}).catch((err) => {
				console.error(err)
			})
			return `Tasks created!`
		},
		{
			name: `project_create_tasks`,
			schema: z.object({
				tasks: z.array(
					z.object({
						name: z.string().describe(`Task name`),
						type: z.enum(['research', 'report', 'deploy']).describe(`Task type`)
					})
				).describe('Tasks to create')
			}),
			description: 'Create tasks in project.'
		}
	)
	return createTasksTool
}
