import { projectTaskModelView } from '../task-result-context'
import { taskResultReadSchema } from '../../../runtime/project-task-result-page'
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
    projectTaskDecisionToolInputSchema,
    agentDeliveryRecoverySchema
} from '@xpert-ai/contracts'
import type { IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { v5 as uuidv5 } from 'uuid'
import {
    UpdateProjectTaskPlanCommand,
    DispatchProjectTaskCommand,
    DecideProjectTaskReferenceCommand,
    GetProjectRuntimeTaskCommand,
    ReadProjectTaskResultCommand,
    RecoverProjectTaskDeliveryCommand,
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
                const { taskId, executionId, ...recovery } = input
                return commandBus.execute(
                    new RecoverProjectTaskDeliveryCommand(context.projectId, taskId, executionId, {
                        expectedRevision: recovery.expectedRevision,
                        paths: recovery.paths
                    })
                )
            },
            {
                name: ProjectToolEnum.RecoverDelivery,
                schema: agentDeliveryRecoverySchema.extend({
                    taskId: z.string().uuid(),
                    executionId: z.string().uuid()
                }),
                description:
                    'Recover requested report-file or artifact delivery for an already finished execution. Read project_get_task first and supply its invocation revision. If artifact delivery was requested without fixed paths, supply exact relative file paths. No pending file delivery returns the current invocation unchanged; unsupported rereading returns DeliveryRecoveryUnavailable. This only reads the original authorized workspace; it does not restart coding, deployment or tests, change the report path, or accept the task. After recovery, use the new result revision for independent review and acceptance.'
            }
        ),
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
                    new DecideProjectTaskReferenceCommand(
                        context.projectId,
                        {
                            ...input,
                            requestId: requestId(context.projectId, ProjectToolEnum.DecideTask, actor)
                        },
                        actor
                    )
                )
            },
            {
                name: ProjectToolEnum.DecideTask,
                schema: projectTaskDecisionToolInputSchema,
                description:
                    'After reading the candidate evidence and independent review Markdown, decide accept or rework. Copy decisionRef unchanged from project_get_task.decisionOptions, supply outcome and a concise rationale; checks are optional. Acceptance records task completion; no follow-up status or checklist completion update is needed. For grouped delivery read the summary task and use its reference to finish the summary and selected implementation together. Do not assemble IDs, versions, digests or evidence arrays. A stale reference requires rereading and reassessment, not guessing fields or restarting coding. The host validates identity, permissions and concurrency; you judge business quality. If a call outcome is uncertain, inspect the recorded decision before making a new call.'
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
                    'Delegate a task using current revision and requirements from project_get_task. Choose exactly one authorized bindingId or group-member target from project_list_task_runtimes. Group targets become responsible; external Runtimes preserve the owner or default to the current Assistant. A Project general agent must assign an owner. For a running external attempt, report interim status and end the turn; durable result delivery resumes coordination unless paused, stopped, or awaiting input or approval. Assign independent execution review with purpose={type:"implementation",reviewer:{bindingId,mode:"execution"}}. After implementation, dispatch purpose={type:"review",mode:"execution",candidatePaths:["candidate"],implementationExecutionId,implementationInvocationId,specificationDigest,evidence} using exact subject references from project_get_task. Select exact Project-relative source or artifact paths for the candidate; the supporting environment supplies the review workspace. Omitting review mode retains evidence-only review. After a recorded rework decision, an implementation may use purpose.rework={reviewExecutionId,feedback:"specific changes requested after reading the Markdown report"}; retain its reviewer assignment. Prior feedback is historical context, and the new candidate requires fresh acceptance. Ordinary tasks need no report file or artifact export; omit delivery unless needed. File delivery is an object: delivery={mode:"files",paths:["relative/file"]}, no wildcards, or {mode:"files",reportPath:"output/report.md"}; collect additional files with delivery recovery once their exact paths are known. Execution-review delivery paths are relative to its review workspace. Group targets do not support review or file delivery. Operation identities and replay deduplication are host-managed; inspect uncertain outcomes before intentional new attempts. For a separate review task set reviewAsSubtask=true with the implementation taskId. Use the returned projectTaskId for later attempts on that candidate without reviewAsSubtask; a new implementation needs a new review task. Returns task/attempt/invocation IDs. Read the Markdown review and explicitly decide accept/rework with project_decide_task; the host verifies candidate identity but does not infer a verdict from report wording.'
            }
        ),
        tool(
            async (input) => {
                await assertPermission('view')
                return projectTaskModelView(
                    await commandBus.execute(new GetProjectRuntimeTaskCommand(context.projectId, input.taskId))
                )
            },
            {
                name: ProjectToolEnum.GetTask,
                schema: z.object({ taskId: z.string().uuid() }).strict(),
                description:
                    'Read requirements, children, attempts and authorized result excerpts. Long reports have explicit paging references for project_read_task_result; excerpts alone do not establish acceptance. decisionOptions supplies fixed decisionRef values for current candidates or specific blocking diagnostics. Read the referenced review task and its Markdown before deciding. A summary reference decides overall delivery; an implementation reference decides only that child. Review tasks are findings, not decision targets: read their parent/implementation task to decide. This read never starts execution or accepts a task.'
            }
        ),
        tool(
            async (input) => {
                await assertPermission('view')
                return commandBus.execute(new ReadProjectTaskResultCommand(context.projectId, input))
            },
            {
                name: ProjectToolEnum.ReadResult,
                schema: taskResultReadSchema,
                description:
                    'Read an exact page after project_get_task. source="report" (default) reads result evidence; source="prompt" reads the archived delegation prompt including the pinned requirements and additional instructions. Copy taskId, executionId and expectedRevision from the observed invocation. Offset and limit count UTF-16 characters; follow nextOffset. A changed revision requires rereading the task. Archived prompts and full reports remain readable. Read needed evidence before deciding; omitted text is not evidence of success.'
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
