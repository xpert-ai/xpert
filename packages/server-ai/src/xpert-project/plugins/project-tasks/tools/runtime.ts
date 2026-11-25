import { projectTaskModelView } from '../task-result-context'
import { taskResultReadSchema } from '../../../runtime/project-task-result-page'
import { projectTaskPlanSchema } from '../../../project-task-plan.schema'
import { emitResourceCard } from '@xpert-ai/plugin-sdk'
import { HttpException, Logger } from '@nestjs/common'
import { t } from 'i18next'
import { AgentInvocationError } from '../../../../agent-invocation/invocation-errors'
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
import { ProjectTaskResultUnavailable } from '../../../runtime/project-task-result-unavailable'

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
                const { taskId, executionId, expectedRevision, paths } = input
                try {
                    return await commandBus.execute(
                        new RecoverProjectTaskDeliveryCommand(context.projectId, taskId, executionId, {
                            expectedRevision,
                            paths
                        })
                    )
                } catch (error) {
                    // File recollection can reject a stale or ineligible result. Let the
                    // coordinator reassess it; authorization/control and launch errors stay fatal.
                    if (
                        error instanceof AgentInvocationError &&
                        ['InvalidRequest', 'ConcurrentUpdate', 'DeliveryRecoveryUnavailable', 'NotFound'].includes(
                            error.code
                        )
                    )
                        throw new HttpException(
                            t('server-ai:Error.ProjectTaskDeliveryRecoveryRejected', { reason: error.code }),
                            error.getStatus()
                        )
                    throw error
                }
            },
            {
                name: ProjectToolEnum.RecoverDelivery,
                schema: agentDeliveryRecoverySchema.extend({
                    taskId: z.string().uuid(),
                    executionId: z.string().uuid()
                }),
                description:
                    'Recover requested report-file or artifact delivery only for a succeeded execution with a stored result. Read project_get_task first and supply its invocation revision. Failed execution without a result is ineligible: inspect any existing report through authorized Project file tools, then decide continuation or blockage; do not repeat recovery unchanged. If artifact delivery was requested without fixed paths, supply exact relative file paths. No pending file delivery returns the current invocation unchanged; unsupported rereading returns DeliveryRecoveryUnavailable. This only reads the original authorized workspace; it does not restart coding, deployment or tests, create missing files, change the report path, or accept the task. After recovery, use the new result revision for independent review and acceptance.'
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
                let receipt: Awaited<ReturnType<ProjectTaskDispatchService['dispatch']>>
                try {
                    receipt = await commandBus.execute(
                        new DispatchProjectTaskCommand(
                            context.projectId,
                            { ...input, requestId: requestId(context.projectId, ProjectToolEnum.DispatchTask, actor) },
                            actor
                        )
                    )
                } catch (error) {
                    // An unsupported mode is a correctable selection, not a revoked authorization.
                    if (error instanceof AgentInvocationError && error.code === 'Unsupported')
                        return {
                            error: 'Unsupported',
                            message: error.message,
                            recovery:
                                'Read project_get_task and project_list_task_runtimes. Select an authorized binding whose reviewModes includes the requested mode; reuse the same task. Do not infer support from its name or create another task.'
                        }
                    throw error
                }
                if (receipt.card)
                    await emitResourceCard(receipt.card, config).catch(() => {
                        Logger.warn('Committed task delegation card could not be emitted', 'ProjectTasks')
                    })
                const { card: _card, ...result } = receipt
                return result
            },
            {
                name: ProjectToolEnum.DispatchTask,
                verboseParsingErrors: true,
                schema: projectTaskDispatchToolInputSchema.refine(
                    (input) => !input.reviewAsSubtask || input.purpose?.type === 'review',
                    {
                        path: ['reviewAsSubtask'],
                        message:
                            'reviewAsSubtask=true is only valid for purpose.type=review. Omit it when dispatching implementation; assigning a reviewer does not start a review.'
                    }
                ),
                description:
                    'Delegate a task using current revision and requirements from project_get_task. Choose exactly one authorized bindingId or group-member target from project_list_task_runtimes. Group targets become responsible; external Runtimes preserve the owner or default to the current Assistant. A Project general agent must assign an owner. After dispatch, finish independent coordination and end the turn when waiting for results; durable result delivery resumes coordination. Do not poll unchanged status, sleep, or redispatch merely to wait. Choose a reviewer with "execution" in project_list_task_runtimes.reviewModes; independence comes from the separate task/session, not a different provider. Assign independent execution review with purpose={type:"implementation",reviewer:{bindingId,mode:"execution"}}. Later implementation attempts inherit that reviewer when omitted, with fresh authorization. Only when the latest recorded rework decision references an independent review, use purpose={type:"implementation",rework:{reviewExecutionId,feedback:"specific changes from the review"}} with that exact review execution ID. Never substitute a coordinator Assistant execution ID. feedback and reviewExecutionId belong inside rework, not directly inside purpose. If the rework decision has no independent review, omit rework, use purpose={type:"implementation"}, and put concrete recovery instructions in the top-level instructions field. Reuse the existing task with its current revision. A new candidate still needs any required independent review. Dispatch review with purpose={type:"review",mode:"execution",candidatePaths:["candidate"],implementationExecutionId,implementationInvocationId,specificationDigest,evidence} using exact references from project_get_task. candidatePaths are exact Project-relative source/artifact paths. Omitting review mode retains evidence-only review. Set reviewAsSubtask=true with the implementation taskId to create or resume its pinned review task; later attempts use the returned projectTaskId without reviewAsSubtask. A new implementation gets a new review task. Ordinary tasks need no report or artifact export. Optional delivery={mode:"files",paths:["relative/file"]} (no wildcards) or {mode:"files",reportPath:"output/report.md"}; recover additional files once exact paths are known. Review delivery paths are relative to its review workspace. Group targets do not support review or file delivery. Host-managed identities deduplicate replays; inspect uncertain outcomes before new attempts. Returns task/attempt/invocation IDs. Read independent review Markdown and use project_decide_task; the host verifies candidate identity, not business correctness. Judge a scoped testing task by its verified findings, including failures; completing that task does not accept the tested product.'
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
            async (input, config) => {
                await assertPermission('view')
                try {
                    return await commandBus.execute(new ReadProjectTaskResultCommand(context.projectId, input))
                } catch (error) {
                    if (error instanceof ProjectTaskResultUnavailable)
                        return error.forCoordinator(
                            context.conversationId,
                            config?.configurable?.thread_id ?? context.threadId
                        )
                    throw error
                }
            },
            {
                name: ProjectToolEnum.ReadResult,
                schema: taskResultReadSchema,
                description:
                    'Read an exact page only when project_get_task provides an invocationId and result paging reference. Pipeline stage executions without invocationId have no Runtime report; do not guess revisions or read them with this tool. source="report" (default) reads result evidence; copy taskId, executionId and expectedRevision from its result paging reference or invocationRevision, never the task revision. source="prompt" reads the immutable archived delegation prompt and needs no expectedRevision. Reading a page does not poll or refresh the executor. Offset and limit count UTF-16 characters; follow nextOffset. A changed report revision requires rereading the task; never increment expectedRevision. A failed or cancelled invocation can have no report: read its error from project_get_task and decide recovery instead of repeating this read. Read needed evidence before deciding; omitted text is not evidence of success.'
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
                    'List authorized Runtime bindings and Project-bound group members. For a group member, dispatch using its target object; the selected Assistant is automatically assigned responsibility. For a Runtime binding use bindingId and its host-verified reviewModes when assigning a reviewer. Execution review requires reviewModes to include "execution". An empty list cannot review; a distinct binding is not required for an independent review session. Existing responsibility is preserved, otherwise the current Assistant becomes responsible. Supply exactly one of target or bindingId.'
            }
        )
    ]
}
