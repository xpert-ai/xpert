import { projectTaskPlanSchema } from '../../../project-task-plan.schema'
import { emitResourceCard } from '@xpert-ai/plugin-sdk'
import { Logger } from '@nestjs/common'
import type { ProjectTaskDispatchService } from '../../../runtime/project-task-dispatch.service'
import { RunnableConfig } from '@langchain/core/runnables'
import { tool } from '@langchain/core/tools'
import { CommandBus } from '@nestjs/cqrs'
import {
    getToolCallFromConfig,
    projectTaskDispatchToolInputSchema,
    projectTaskDecisionInputSchema
} from '@xpert-ai/contracts'
import type { IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { v5 as uuidv5 } from 'uuid'
import {
    UpdateProjectTaskPlanCommand,
    DispatchProjectTaskCommand,
    DecideProjectTaskCommand,
    GetProjectRuntimeTaskCommand,
    ListProjectRuntimeBindingsCommand
} from '../../../runtime/project-task-dispatch.command'
import { ProjectTaskCaller, projectTaskCallerSchema } from '../../../runtime/project-task-dispatch.schema'
import { projectTaskRuntimeError } from '../../../runtime/project-task-runtime.errors'
import { ProjectToolEnum } from '../constants'

// Checkpoint replay can use a new Agent run. Keep identity tied to the persisted tool call,
// not the current executionId or mutable arguments; changed arguments must still conflict.
function requestId(projectId: string, operation: ProjectToolEnum, caller: ProjectTaskCaller) {
    return uuidv5(
        JSON.stringify([
            'xpert.project-tasks.tool.v1',
            projectId,
            caller.conversationId,
            caller.threadId,
            caller.type,
            caller.xpertId ?? null,
            caller.agentKey,
            operation,
            caller.sourceMessageId
        ]),
        uuidv5.URL
    )
}

export function createProjectRuntimeTools(
    context: Pick<
        IAgentMiddlewareContext,
        'projectId' | 'conversationId' | 'threadId' | 'executionId' | 'callerType' | 'xpertId' | 'agentKey'
    >,
    commandBus: CommandBus,
    assertPermission: (action: 'view' | 'edit') => Promise<unknown>
) {
    const caller = (config?: RunnableConfig) => {
        // Runnable config is host-owned, separate from model input. Legacy middleware hosts are Assistant callers.
        const configurable = config?.configurable
        const parsed = projectTaskCallerSchema.safeParse({
            type: context.callerType ?? 'xpert',
            executionId: configurable?.executionId ?? context.executionId,
            conversationId: context.conversationId,
            threadId: configurable?.thread_id ?? context.threadId,
            xpertId: context.xpertId ?? undefined,
            agentKey: context.agentKey,
            sourceMessageId: getToolCallFromConfig(config)?.id ?? configurable?.tool_call_id
        })
        if (!parsed.success) throw projectTaskRuntimeError('Scope')
        return parsed.data
    }
    return [
        tool(
            async (input) => {
                await assertPermission('edit')
                return commandBus.execute(
                    new UpdateProjectTaskPlanCommand(context.projectId, {
                        ...input,
                        taskId: input.taskId!,
                        expectedRevision: input.expectedRevision!
                    })
                )
            },
            {
                name: ProjectToolEnum.UpdatePlan,
                schema: projectTaskPlanSchema.extend({
                    predecessorIds: z.array(z.string().uuid()).max(100).optional()
                }),
                description:
                    'Persist task dependencies and schedule using the latest task revision. Set predecessorIds to the exact earlier task IDs before dispatching a dependent batch. Rejects cycles, cross-project dependencies and stale revisions. Does not start execution.'
            }
        ),
        tool(
            async (input, config) => {
                await assertPermission('edit')
                const actor = caller(config)
                return commandBus.execute(
                    new DecideProjectTaskCommand(
                        context.projectId,
                        projectTaskDecisionInputSchema.parse({
                            ...input,
                            requestId: requestId(context.projectId, ProjectToolEnum.DecideTask, actor)
                        }),
                        actor
                    )
                )
            },
            {
                name: ProjectToolEnum.DecideTask,
                schema: projectTaskDecisionInputSchema.omit({ requestId: true }),
                description:
                    'After project_get_task and checking actual evidence, explicitly accept or request rework for the latest implementation. Supply exact specificationDigest, implementationExecutionId and invocation_result revision from the detail, rationale and checks performed. Optional reviewExecutionId must be a matching independent review; acceptance requires pass. CLI success alone is insufficient. The platform manages operation identity and retry deduplication. If a previous call has an uncertain outcome, inspect project_get_task for the recorded decision before making a new call.'
            }
        ),
        tool(
            async (input, config) => {
                await assertPermission('edit')
                const actor = caller(config)
                const receipt: Awaited<ReturnType<ProjectTaskDispatchService['dispatch']>> = await commandBus.execute(
                    new DispatchProjectTaskCommand(
                        context.projectId,
                        { ...input, requestId: requestId(context.projectId, ProjectToolEnum.DispatchTask, actor) },
                        actor
                    )
                )
                if (receipt.card)
                    await emitResourceCard(receipt.card, config).catch(() => {
                        Logger.warn('Committed task delegation card could not be emitted', 'ProjectTasks')
                    })
                const { card: _card, ...result } = receipt
                return result
            },
            {
                name: ProjectToolEnum.DispatchTask,
                schema: projectTaskDispatchToolInputSchema,
                description:
                    'Explicitly delegate an existing task using its latest revision from project_get_task. Requirements and an explicit responsible project-member Assistant must be defined. If unassigned, update assigneeXpertId with project_update_tasks, then read the latest revision before retrying. Caller and executor identities never default task ownership. For a group member, use the target object returned by project_list_task_runtimes and omit bindingId and delivery; the member returns ordinary Assistant output. For an external Runtime use bindingId and omit target. Only external Runtimes support file delivery: use delivery={mode:"files",paths:["relative/path"]}, with exact project-relative paths and no wildcards. If paths are decided during execution, use delivery={mode:"files"} and require file result items. delivery is an optional object, never a string. The platform manages operation identity and retry deduplication. After an uncertain outcome inspect project_get_task instead of dispatching again. Make a new call only for an intentional new attempt. Returns task, attempt and invocation IDs; Runtime success does not accept the task.'
            }
        ),
        tool(
            async (input) => {
                await assertPermission('view')
                return commandBus.execute(new GetProjectRuntimeTaskCommand(context.projectId, input.taskId))
            },
            {
                name: ProjectToolEnum.GetTask,
                schema: z.object({ taskId: z.string().uuid() }).strict(),
                description:
                    'Read task requirements, revision, attempt history and authorized Runtime results. Observes existing executions; never starts one.'
            }
        ),
        tool(
            async (_, config) => {
                await assertPermission('edit')
                return commandBus.execute(new ListProjectRuntimeBindingsCommand(context.projectId, caller(config)))
            },
            {
                name: ProjectToolEnum.ListRuntimes,
                schema: z.object({}).strict(),
                description:
                    'List authorized Runtime bindings and Project-bound group members. For a group member, assign the task to its assigneeXpertId and dispatch using its target object; for a Runtime binding use bindingId. Supply exactly one of target or bindingId.'
            }
        )
    ]
}
