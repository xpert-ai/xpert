import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { XpertProjectTaskService } from '../../../services'
import { ProjectToolEnum } from '../project'

export const createListTasksTool = ({
    projectId,
    service,
    assertPermission
}: {
    projectId: string
    service: XpertProjectTaskService
    assertPermission?: () => Promise<unknown>
}) => {
    const listTasksTool = tool(
        async () => {
            await assertPermission?.()
            const { items } = await service.findAll({
                where: { projectId },
                relations: ['steps', 'executions'],
                order: { createdAt: 'ASC' }
            })
            return items.map((task) => ({
                id: task.id,
                title: task.title || task.name,
                status: task.status,
                priority: task.priority,
                description: task.description,
                assigneeId: task.assigneeId,
                planId: task.planId,
                milestoneId: task.milestoneId,
                threadId: task.threadId,
                latestExecution: task.executions?.[task.executions.length - 1]
                    ? {
                          id: task.executions[task.executions.length - 1].id,
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
            schema: z.object({}),
            description: 'List all task in project.'
        }
    )
    return listTasksTool
}
