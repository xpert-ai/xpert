import { tool } from '@langchain/core/tools'
import { HttpException } from '@nestjs/common'
import { getToolCallFromConfig, IXpertProjectTask, TAgentRunnableConfigurable } from '@xpert-ai/contracts'
import { z } from 'zod/v3'
import { XpertProjectTaskService } from '../../../services'
import { ProjectToolEnum } from '../constants'

const receipt = (task: IXpertProjectTask) => ({
    id: task.id,
    projectId: task.projectId,
    revision: task.revision,
    title: task.title || task.name,
    status: task.status,
    assigneeXpertId: task.assigneeXpertId,
    requirements: task.requirements ?? [],
    kind: task.kind,
    parentTaskId: task.parentTaskId
})

export const createCreateTasksTool = ({
    projectId,
    service,
    conversationId,
    defaultAssigneeXpertId,
    assertPermission
}: {
    projectId: string
    service: XpertProjectTaskService
    conversationId?: string
    defaultAssigneeXpertId?: string
    assertPermission: () => Promise<unknown>
}) => {
    const createTasksTool = tool(
        async (_, config) => {
            await assertPermission()
            const { configurable } = config ?? {}
            const { thread_id } = <TAgentRunnableConfigurable>configurable ?? {}
            const toolCall = getToolCallFromConfig(config)

            const tasks: IXpertProjectTask[] = []
            for (const [inputIndex, taskInput] of _.tasks.entries()) {
                let createdTaskId: string | undefined
                try {
                    const task = await service.createTask(projectId, {
                        ...taskInput,
                        threadId: thread_id,
                        status: 'todo',
                        assigneeXpertId: taskInput.assigneeXpertId ?? defaultAssigneeXpertId,
                        steps: taskInput.steps?.map((step, i) => ({ ...step, stepIndex: i + 1, status: 'pending' }))
                    } as IXpertProjectTask)
                    tasks.push(task)
                    createdTaskId = task.id
                    if (conversationId) {
                        await service.linkConversation(projectId, task.id, {
                            conversationId,
                            relationType: 'origin',
                            isPrimary: true,
                            sourceMessageId: toolCall?.id
                        })
                    }
                } catch (error) {
                    // Individual creates commit independently. Preserve their receipts when a later
                    // input is rejected; authorization and unknown failures retain their error path.
                    if (!(error instanceof HttpException) || ![400, 409].includes(error.getStatus())) throw error
                    return {
                        tasks: tasks.map(receipt),
                        completed: false,
                        failure: {
                            inputIndex,
                            name: taskInput.name,
                            parentTaskId: taskInput.parentTaskId,
                            operation: createdTaskId ? 'link_conversation' : 'create_task',
                            createdTaskId,
                            statusCode: error.getStatus(),
                            message: error.message,
                            details: error.getResponse()
                        },
                        recovery:
                            'The returned tasks are already saved. Reuse their IDs; do not repeat successful inputs. Inspect the failed input and current task state before correcting it. Child parentTaskId must identify an existing ordinary summary task, not a business-managed stage. Later inputs were not attempted.'
                    }
                }
            }

            // The normal tool step records creation; only an actual delegation emits a resource card.
            return {
                tasks: tasks.map(receipt)
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
                                    kind: z
                                        .enum(['task', 'summary'])
                                        .optional()
                                        .describe(
                                            'A summary groups child tasks and cannot be dispatched to a Runtime.'
                                        ),
                                    parentTaskId: z
                                        .string()
                                        .uuid()
                                        .optional()
                                        .describe(
                                            'Existing ordinary summary task in this project that is not completed or cancelled.'
                                        ),
                                    priority: z.enum(['urgent', 'high', 'medium', 'low']).optional(),
                                    assigneeXpertId: z
                                        .string()
                                        .uuid()
                                        .optional()
                                        .describe(
                                            'Responsible Project Assistant ID. Defaults to the current Assistant when omitted; never use a human or Runtime binding ID.'
                                        ),
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
                'Create project tasks in todo and return their IDs and revisions. Each input is saved separately; a rejected input returns completed=false with receipts for already saved tasks and the failing input index. Reuse those IDs instead of repeating the batch. Create a summary first, then use its returned ID for children; a Pipeline stage is not an ordinary parent. Omitted responsibility defaults to the current Assistant from trusted context; an explicit assigneeXpertId is preserved. A Project general agent has no Assistant identity to default. Creation records responsibility without starting execution. Use project_dispatch_task to explicitly delegate.'
        }
    )
    return createTasksTool
}
