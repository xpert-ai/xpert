import { emitResourceCard } from '@xpert-ai/plugin-sdk'
import { Logger } from '@nestjs/common'
import { projectTaskCard } from '../../../runtime/project-task-card'
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { tool } from '@langchain/core/tools'
import {
    ChatMessageEventTypeEnum,
    ChatMessageStepCategory,
    getToolCallFromConfig,
    IXpertProjectTask,
    TAgentRunnableConfigurable
} from '@xpert-ai/contracts'
import { z } from 'zod/v3'
import { XpertProjectTaskService } from '../../../services'
import { PROJECT_TASKS_MIDDLEWARE, ProjectToolEnum } from '../constants'

export const createCreateTasksTool = ({
    projectId,
    service,
    conversationId,
    assertPermission
}: {
    projectId: string
    service: XpertProjectTaskService
    conversationId?: string
    assertPermission: () => Promise<unknown>
}) => {
    const createTasksTool = tool(
        async (_, config) => {
            await assertPermission()
            const { configurable } = config ?? {}
            const { thread_id } = <TAgentRunnableConfigurable>configurable ?? {}
            const toolCall = getToolCallFromConfig(config)

            const tasks: IXpertProjectTask[] = []
            for (const taskInput of _.tasks) {
                const task = await service.createTask(projectId, {
                    ...taskInput,
                    threadId: thread_id,
                    status: 'todo',
                    assigneeXpertId: taskInput.assigneeXpertId,
                    steps: taskInput.steps?.map((step, i) => ({ ...step, stepIndex: i + 1, status: 'pending' }))
                } as IXpertProjectTask)
                tasks.push(task)
                await emitResourceCard(
                    projectTaskCard({ type: 'task', id: task.id, title: task.title || task.name, status: task.status }),
                    config
                ).catch(() => Logger.warn('Committed task card could not be emitted', 'ProjectTasks'))
                if (conversationId) {
                    await service.linkConversation(projectId, task.id, {
                        conversationId,
                        relationType: 'origin',
                        isPrimary: true,
                        sourceMessageId: toolCall?.id
                    })
                }
            }

            // Tool message event
            await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
                id: toolCall?.id,
                category: 'Computer',
                type: ChatMessageStepCategory.Tasks,
                toolset: PROJECT_TASKS_MIDDLEWARE,
                tool: 'project_create_tasks',
                message: _.tasks.map((_) => _.name).join('\n\n'),
                title: await service.translate('xpert.Project.CreatingTasks'),
                data: tasks
            })
            return {
                tasks: tasks.map((task) => ({
                    id: task.id,
                    projectId: task.projectId,
                    revision: task.revision,
                    title: task.title || task.name,
                    status: task.status,
                    requirements: task.requirements ?? []
                }))
            }
        },
        {
            name: ProjectToolEnum.CreateTasks,
            schema: z
                .object({
                    tasks: z
                        .array(
                            z
                                .object({
                                    name: z.string().trim().min(1).max(200).describe(`Task name`),
                                    title: z.string().trim().min(1).max(200).optional().describe(`Display title`),
                                    description: z
                                        .string()
                                        .trim()
                                        .max(16000)
                                        .optional()
                                        .describe(`Short task description`),
                                    type: z.string().trim().min(1).max(200).optional().describe(`Business task type`),
                                    priority: z.enum(['urgent', 'high', 'medium', 'low']).optional(),
                                    assigneeXpertId: z
                                        .string()
                                        .uuid()
                                        .optional()
                                        .describe('Project expert id responsible for execution'),
                                    requirements: z
                                        .array(z.string().trim().min(1).max(4000))
                                        .min(1)
                                        .max(64)
                                        .describe('Explicit completion requirements'),
                                    planId: z.string().uuid().optional(),
                                    milestoneId: z.string().uuid().optional(),
                                    steps: z
                                        .array(
                                            z
                                                .object({
                                                    description: z
                                                        .string()
                                                        .trim()
                                                        .min(1)
                                                        .max(4000)
                                                        .describe('Description of individual step')
                                                })
                                                .strict()
                                        )
                                        .max(100)
                                })
                                .strict()
                        )
                        .min(1)
                        .max(50)
                        .describe('Tasks to create')
                })
                .strict(),
            description:
                'Create project tasks in todo and return their IDs and revisions. Assignment records responsibility; it does not start execution. Use project_dispatch_task to explicitly delegate.'
        }
    )
    return createTasksTool
}
