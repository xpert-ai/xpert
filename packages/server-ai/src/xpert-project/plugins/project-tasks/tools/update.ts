import { tool } from '@langchain/core/tools'
import { TAgentRunnableConfigurable } from '@xpert-ai/contracts'
import { z } from 'zod/v3'
import { XpertProjectTaskService } from '../../../services'
import { ProjectToolEnum } from '../constants'

export const createUpdateTasksTool = ({
    projectId,
    service,
    assertPermission
}: {
    projectId: string
    service: XpertProjectTaskService
    assertPermission: () => Promise<unknown>
}) => {
    const updateTasksTool = tool(
        async (_, config) => {
            await assertPermission()
            const { configurable } = config ?? {}
            const { thread_id, executionId } = <TAgentRunnableConfigurable>configurable ?? {}

            const tasks = await service.updateTaskSteps(projectId, thread_id, ..._.tasks)
            if (executionId) {
                for (const task of tasks) {
                    const { executions } = await service.listTaskRelations(projectId, task.id)
                    const execution = executions.find((item) => item.agentExecutionId === executionId)
                    if (execution && !execution.invocationId) {
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

            return `Tasks updated!`
        },
        {
            name: ProjectToolEnum.UpdateTasks,
            schema: z
                .object({
                    tasks: z
                        .array(
                            z
                                .object({
                                    id: z.string().uuid().optional().describe(`Project task id`),
                                    name: z.string().trim().min(1).max(200).optional().describe(`Task name`),
                                    status: z
                                        .enum([
                                            'todo',
                                            'in_progress',
                                            'review',
                                            'paused',
                                            'done',
                                            'blocked',
                                            'cancelled'
                                        ])
                                        .optional(),
                                    steps: z
                                        .array(
                                            z
                                                .object({
                                                    stepIndex: z
                                                        .number()
                                                        .int()
                                                        .positive()
                                                        .max(100)
                                                        .describe('Index of step'),
                                                    status: z
                                                        .enum(['pending', 'running', 'done', 'failed'])
                                                        .describe('Status of step.'),
                                                    notes: z
                                                        .string()
                                                        .max(4000)
                                                        .optional()
                                                        .describe('Notes of step status')
                                                })
                                                .strict()
                                        )
                                        .max(100)
                                })
                                .strict()
                                .refine((task) => Boolean(task.id || task.name), 'Provide a task id or name')
                        )
                        .min(1)
                        .max(50)
                        .describe('Tasks to update status')
                })
                .strict(),
            description: 'Update step status of tasks in project.'
        }
    )
    return updateTasksTool
}
