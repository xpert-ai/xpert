import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { tool } from '@langchain/core/tools'
import { ChatMessageEventTypeEnum, TAgentRunnableConfigurable } from '@xpert-ai/contracts'
import { z } from 'zod'
import { XpertProjectTaskService } from '../../../services'
import { ProjectToolEnum } from '../project'

export const createUpdateTasksTool = ({
    projectId,
    service,
    assertPermission
}: {
    projectId: string
    service: XpertProjectTaskService
    assertPermission?: () => Promise<unknown>
}) => {
    const updateTasksTool = tool(
        async (_, config) => {
            await assertPermission?.()
            const { configurable } = config ?? {}
            const { thread_id, executionId } = <TAgentRunnableConfigurable>configurable ?? {}

            const tasks = await service.updateTaskSteps(projectId, thread_id, ..._.tasks)
            if (executionId) {
                for (const task of tasks) {
                    const { executions } = await service.listTaskRelations(projectId, task.id)
                    const execution = executions.find((item) => item.agentExecutionId === executionId)
                    if (execution) {
                        const statuses = task.steps?.map((step) => step.status) ?? []
                        const status =
                            task.status === 'done' || (statuses.length > 0 && statuses.every((step) => step === 'done'))
                                ? 'succeeded'
                                : task.status === 'blocked' || statuses.includes('failed')
                                  ? 'failed'
                                  : 'running'
                        await service.updateExecution(projectId, task.id, execution.id, {
                            status,
                            outputSummary: status === 'succeeded' ? 'All task steps completed' : undefined,
                            completedAt: status === 'succeeded' || status === 'failed' ? new Date() : undefined
                        })
                    }
                }
            }

            // Tool message event
            await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
                category: 'Computer',
                toolset: 'project',
                tool: 'project_update_tasks',
                message: _.tasks.map((_) => _.name).join('\n\n'),
                title: await service.translate('xpert.Project.UpdatingTasks'),
                data: tasks
            })

            return `Tasks updated!`
        },
        {
            name: ProjectToolEnum.UpdateTasks,
            schema: z.object({
                tasks: z
                    .array(
                        z.object({
                            id: z.string().optional().describe(`Project task id`),
                            name: z.string().optional().describe(`Task name`),
                            status: z
                                .enum(['todo', 'in_progress', 'review', 'paused', 'done', 'blocked', 'cancelled'])
                                .optional(),
                            steps: z.array(
                                z.object({
                                    stepIndex: z.number().describe('Index of step'),
                                    status: z
                                        .enum(['pending', 'running', 'done', 'failed'])
                                        .describe('Status of step.'),
                                    notes: z.string().optional().describe('Notes of step status')
                                })
                            )
                        })
                    )
                    .describe('Tasks to update status')
            }),
            description: 'Update step status of tasks in project.'
        }
    )
    return updateTasksTool
}
