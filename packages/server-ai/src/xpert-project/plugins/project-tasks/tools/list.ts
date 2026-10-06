import { tool } from '@langchain/core/tools'
import { z } from 'zod/v3'
import { XpertProjectTaskService } from '../../../services'
import { ProjectToolEnum } from '../constants'

export const createListTasksTool = ({
    projectId,
    service,
    assertPermission
}: {
    projectId: string
    service: XpertProjectTaskService
    assertPermission: () => Promise<unknown>
}) => {
    const listTasksTool = tool(
        async () => {
            await assertPermission()
            const { items } = await service.findAll({
                where: { projectId },
                relations: ['steps', 'executions'],
                order: { createdAt: 'ASC' }
            })
            const observed = await service.observeExecutions(
                projectId,
                items.flatMap((task) => task.executions ?? [])
            )
            for (const task of items)
                task.executions = observed
                    .filter((attempt) => attempt.taskId === task.id)
                    .sort((a, b) => a.attempt - b.attempt)
            return items.map((task) => ({
                id: task.id,
                revision: task.revision,
                requirements: task.requirements ?? [],
                title: task.title || task.name,
                status: task.status,
                priority: task.priority,
                description: task.description,
                assigneeId: task.assigneeId,
                assigneeXpertId: task.assigneeXpertId,
                planId: task.planId,
                milestoneId: task.milestoneId,
                threadId: task.threadId,
                latestExecution: task.executions?.[task.executions.length - 1]
                    ? {
                          id: task.executions[task.executions.length - 1].id,
                          invocationStatus: task.executions[task.executions.length - 1].invocationStatus,
                          invocationId: task.executions[task.executions.length - 1].invocationId,
                          dispatchState: task.executions[task.executions.length - 1].dispatchState,
                          status: task.executions[task.executions.length - 1].status,
                          xpertId: task.executions[task.executions.length - 1].xpertId,
                          agentKey: task.executions[task.executions.length - 1].agentKey,
                          threadId: task.executions[task.executions.length - 1].threadId
                      }
                    : undefined,
                steps: task.steps?.map((step) => ({
                    stepIndex: step.stepIndex,
                    description: step.description,
                    status: step.status,
                    notes: step.notes
                }))
            }))
        },
        {
            name: ProjectToolEnum.ListTasks,
            schema: z.object({}).strict(),
            description: 'List all task in project.'
        }
    )
    return listTasksTool
}
