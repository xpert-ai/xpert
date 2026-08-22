import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { tool } from '@langchain/core/tools'
import {
    ChatMessageEventTypeEnum,
    ChatMessageStepCategory,
    getToolCallFromConfig,
    IXpertProjectTask,
    TAgentRunnableConfigurable
} from '@xpert-ai/contracts'
import { z } from 'zod'
import { XpertProjectTaskService } from '../../../services'
import { ProjectToolEnum } from '../project'

export const createCreateTasksTool = ({
    projectId,
    service,
    conversationId,
    assertPermission
}: {
    projectId: string
    service: XpertProjectTaskService
    conversationId?: string
    assertPermission?: () => Promise<unknown>
}) => {
    const createTasksTool = tool(
        async (_, config) => {
            await assertPermission?.()
            const { configurable } = config ?? {}
            const { thread_id, executionId, xpertId, agentKey } = <TAgentRunnableConfigurable>configurable ?? {}
            const toolCall = getToolCallFromConfig(config)

            const tasks: IXpertProjectTask[] = []
            for (const taskInput of _.tasks) {
                const task = await service.createTask(projectId, {
                    ...taskInput,
                    threadId: thread_id,
                    status: taskInput.status ?? 'in_progress',
                    steps: taskInput.steps?.map((step, i) => ({ ...step, stepIndex: i + 1, status: 'pending' }))
                } as IXpertProjectTask)
                tasks.push(task)
                const execution = await service.createExecution(projectId, task.id, {
                    conversationId,
                    threadId: thread_id,
                    agentExecutionId: executionId,
                    xpertId,
                    agentKey,
                    status: 'running',
                    inputSummary: 'Started by the project assistant',
                    startedAt: new Date()
                })
                if (conversationId) {
                    await service.linkConversation(projectId, task.id, {
                        conversationId,
                        relationType: 'execution',
                        isPrimary: true,
                        sourceExecutionId: execution.id
                    })
                }
            }

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
                            title: z.string().optional().describe(`Display title`),
                            description: z.string().optional().describe(`Short task description`),
                            type: z.enum(['research', 'report', 'deploy']).describe(`Task type`),
                            priority: z.enum(['urgent', 'high', 'medium', 'low']).optional(),
                            status: z
                                .enum(['todo', 'in_progress', 'review', 'paused', 'done', 'blocked', 'cancelled'])
                                .optional(),
                            planId: z.string().optional(),
                            milestoneId: z.string().optional(),
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
