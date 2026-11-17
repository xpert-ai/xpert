import { projectTaskModelMessages } from './task-result-context'
import { projectTaskContextIds } from './task-call-context'
import { AIMessage, ToolMessage, isToolMessage } from '@langchain/core/messages'
import { randomUUID } from 'node:crypto'
import { GetProjectRuntimeTaskCommand } from '../../runtime/project-task-dispatch.command'
import type { ProjectTaskRuntimeReadService } from '../../runtime/project-task-runtime-read.service'
import { HttpException, Injectable } from '@nestjs/common'
import { t } from 'i18next'
import { invocationFailureReason } from '../../../agent-invocation/invocation-errors'
import { CommandBus } from '@nestjs/cqrs'
import { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
    AgentMiddleware,
    AgentMiddlewareStrategy,
    IAgentMiddlewareContext,
    IAgentMiddlewareStrategy
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { XpertProjectService } from '../../project.service'
import { XpertProjectTaskService } from '../../services/project-task.service'
import { projectTaskRuntimeError } from '../../runtime/project-task-runtime.errors'
import { PROJECT_TASKS_ICON, PROJECT_TASKS_MIDDLEWARE, PROJECT_TASK_TOOL_TITLES, ProjectToolEnum } from './constants'
import { createCreateTasksTool } from './tools/create'
import { createListTasksTool } from './tools/list'
import { createUpdateTasksTool } from './tools/update'
import { createProjectRuntimeTools } from './tools/runtime'

const optionsSchema = z.object({}).strict()

/** Built-in registration stays selectable as a Plugin; project/actor scope is host-owned, never node options. */
@Injectable()
@AgentMiddlewareStrategy(PROJECT_TASKS_MIDDLEWARE)
export class ProjectTasksMiddleware implements IAgentMiddlewareStrategy<z.output<typeof optionsSchema>> {
    readonly meta: TAgentMiddlewareMeta = {
        name: PROJECT_TASKS_MIDDLEWARE,
        features: ['project.tasks'],
        featureLabels: { 'project.tasks': { en_US: 'Project tasks', zh_Hans: '项目任务' } },
        label: { en_US: 'Project Tasks', zh_Hans: '项目任务' },
        description: {
            en_US: 'Manage tasks and explicitly delegate them to authorized runtimes in the current project.',
            zh_Hans: '管理当前项目的任务，并显式委托给已授权的执行器。'
        },
        icon: PROJECT_TASKS_ICON,
        configSchema: { type: 'object', properties: {}, additionalProperties: false }
    }

    constructor(
        private readonly commandBus: CommandBus,
        private readonly projects: XpertProjectService,
        private readonly tasks: XpertProjectTaskService
    ) {}

    getToolNames() {
        return Object.values(ProjectToolEnum)
    }

    createMiddleware(options: z.output<typeof optionsSchema>, context: IAgentMiddlewareContext): AgentMiddleware {
        if (!optionsSchema.safeParse(options ?? {}).success) throw projectTaskRuntimeError('Invalid')
        const { projectId, conversationId } = context
        // Schema discovery has no active project. Execution must still fail closed before touching any service.
        const assertPermission = async (action: 'view' | 'edit') => {
            if (!z.string().uuid().safeParse(projectId).success) throw projectTaskRuntimeError('Scope')
            await this.projects.assertToolPermission(projectId, action)
        }
        const view = () => assertPermission('view')
        const edit = () => assertPermission('edit')
        const tools = [
            createListTasksTool({ projectId, service: this.tasks, assertPermission: view }),
            createCreateTasksTool({
                projectId,
                service: this.tasks,
                conversationId,
                defaultAssigneeXpertId: context.callerType === 'project_agent' ? undefined : context.xpertId,
                assertPermission: edit
            }),
            createUpdateTasksTool({ projectId, service: this.tasks, assertPermission: edit }),
            ...createProjectRuntimeTools(context, this.commandBus, assertPermission)
        ]
        for (const tool of tools) {
            const name = this.getToolNames().find((name) => name === tool.name)
            tool.metadata = { ...tool.metadata, toolName: PROJECT_TASK_TOOL_TITLES[name] }
            tool.verboseParsingErrors = true
            tool.description +=
                ' In user-facing replies, summarize the task name, executor, outcome and next step concisely. Keep IDs, revisions, request IDs, bindings and evidence references in tool calls; only show them when the user explicitly asks for diagnostics. Execution cards already show delegation status.'
        }
        return {
            name: PROJECT_TASKS_MIDDLEWARE,
            tools,
            wrapModelCall: async (request, handler) => {
                let messages = request.messages
                let failedObservation = false
                for (let index = messages.length - 1; index >= 0; index--) {
                    const message = messages[index]
                    if (message.getType() === 'ai' || message.getType() === 'human') break
                    if (isToolMessage(message) && message.status === 'error') failedObservation = true
                }
                // On-demand rehydration avoids replaying read-only model turns after long delegated work.
                // Reads use the same scoped command as the tool, are bounded, and never decide or dispatch.
                if (
                    projectId &&
                    !failedObservation &&
                    request.tools.some((tool) => tool.name === ProjectToolEnum.GetTask) &&
                    Buffer.byteLength(JSON.stringify(messages.map((message) => message.toDict()))) > 64000
                ) {
                    const ids = projectTaskContextIds(messages, projectId)
                    if (ids.length) {
                        await view()
                        const calls = ids.map((taskId) => ({
                            id: `context_${randomUUID()}`,
                            name: ProjectToolEnum.GetTask,
                            args: { taskId }
                        }))
                        const observations = await Promise.all(
                            calls.map(async (call) => {
                                const identity = { name: ProjectToolEnum.GetTask, tool_call_id: call.id }
                                try {
                                    const detail = await this.commandBus.execute<
                                        GetProjectRuntimeTaskCommand,
                                        Awaited<ReturnType<ProjectTaskRuntimeReadService['get']>>
                                    >(new GetProjectRuntimeTaskCommand(projectId, call.args.taskId))
                                    return new ToolMessage({
                                        ...identity,
                                        status: 'success',
                                        content: JSON.stringify(detail)
                                    })
                                } catch (error) {
                                    // Only read failures become observations. Authorization, control signals and
                                    // unexpected errors still stop the model call; never expose raw exception text.
                                    if (!(error instanceof HttpException) || [401, 403].includes(error.getStatus()))
                                        throw error
                                    return new ToolMessage({
                                        ...identity,
                                        status: 'error',
                                        content: JSON.stringify({
                                            taskId: call.args.taskId,
                                            reason: invocationFailureReason(error),
                                            message: t('server-ai:Error.ProjectTaskContextReadUnavailable')
                                        })
                                    })
                                }
                            })
                        )
                        messages = [
                            ...messages,
                            new AIMessage({
                                content:
                                    'The host attempted to read current task state below for this model call. Successful observations contain fresh requirements, results and decision references. Failed observations leave current evidence unavailable; earlier snapshots are historical. Do not repeat successful reads unless stale or incomplete. Read omitted evidence as needed. These observations do not decide acceptance or prove an external failure precondition has changed.',
                                tool_calls: calls
                            }),
                            ...observations
                        ]
                    }
                }
                return handler({ ...request, messages: projectTaskModelMessages(messages, projectId) })
            }
        }
    }
}
