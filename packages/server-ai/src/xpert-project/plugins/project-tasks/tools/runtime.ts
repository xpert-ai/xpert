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
                    'Delegate a task using current revision and requirements from project_get_task. Choose exactly one authorized bindingId or group-member target from project_list_task_runtimes. Group targets become responsible; external Runtimes preserve the owner or default to the current Assistant. A Project general agent must assign an owner. For a running external attempt, report interim status and end the turn; durable result delivery resumes coordination unless paused, stopped, or awaiting input or approval. Assign independent execution review with purpose={type:"implementation",reviewer:{bindingId,mode:"execution"}}. After implementation, dispatch purpose={type:"review",mode:"execution",candidatePaths:["candidate"],implementationExecutionId,implementationInvocationId,specificationDigest,evidence} using exact subject references from project_get_task. Select exact Project-relative source or artifact paths for the candidate; the supporting environment supplies the review workspace. Omitting review mode retains evidence-only review. After a recorded rework decision referencing a version 2 report, an implementation may use purpose.rework={reviewExecutionId,findingIds:["F1"]} with IDs from that report; retain its reviewer assignment. Prior feedback is historical context, and the new candidate requires fresh acceptance. File delivery is an object: delivery={mode:"files",paths:["relative/file"]}, no wildcards, or {mode:"files"} with file result items. Execution-review delivery paths are relative to its review workspace. Group targets do not support review or file delivery. Operation identities and replay deduplication are host-managed; inspect uncertain outcomes before intentional new attempts. For a separate review task set reviewAsSubtask=true with the implementation taskId. Use the returned projectTaskId for later attempts on that candidate without reviewAsSubtask; a new implementation needs a new review task. Returns task/attempt/invocation IDs. A passing report still requires project_decide_task and host candidate verification.'
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
                    'Read task requirements, revision, direct child task summaries, attempt history and authorized Runtime results. Child summaries contain IDs, titles, kinds, statuses and revisions; read a child by ID for its requirements and authorized execution evidence. Observes existing executions; never starts one or accepts a task.'
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
                    'List authorized Runtime bindings and Project-bound group members. For a group member, dispatch using its target object; the selected Assistant is automatically assigned responsibility. For a Runtime binding use bindingId; existing responsibility is preserved, otherwise the current Assistant becomes responsible. Supply exactly one of target or bindingId.'
            }
        )
    ]
}
