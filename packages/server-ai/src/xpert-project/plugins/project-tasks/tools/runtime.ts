import { emitResourceCard } from '@xpert-ai/plugin-sdk'
import { Logger } from '@nestjs/common'
import type { ProjectTaskDispatchService } from '../../../runtime/project-task-dispatch.service'
import { RunnableConfig } from '@langchain/core/runnables'
import { tool } from '@langchain/core/tools'
import { CommandBus } from '@nestjs/cqrs'
import {
    getToolCallFromConfig,
    projectTaskDispatchInputSchema,
    projectTaskDecisionInputSchema
} from '@xpert-ai/contracts'
import type { IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { v5 as uuidv5 } from 'uuid'
import {
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
            async (input, config) => {
                await assertPermission('edit')
                const actor = caller(config)
                return commandBus.execute(
                    new DecideProjectTaskCommand(
                        context.projectId,
                        { ...input, requestId: requestId(context.projectId, ProjectToolEnum.DecideTask, actor) },
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
                schema: projectTaskDispatchInputSchema.omit({ requestId: true }),
                description:
                    'Explicitly delegate an existing task to an authorized background Runtime, using the revision from project_get_task. Requirements must be defined. For file delivery use exact paths relative to the project working directory; wildcards/globs are not supported. If paths will be decided during execution, set delivery={mode:"files"} without paths and require the executor to declare every deliverable as a file result item. The platform manages operation identity and retry deduplication. If a previous call has an uncertain outcome, inspect project_get_task instead of submitting another delegation. Make a new call only for an intentional new attempt. Returns task, attempt and invocation IDs; success of the Runtime does not accept the task.'
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
                    'List Runtime bindings authorized for the current project caller workspace. Choose a bindingId for project_dispatch_task; dispatch also checks background capability and Computer policy.'
            }
        )
    ]
}
