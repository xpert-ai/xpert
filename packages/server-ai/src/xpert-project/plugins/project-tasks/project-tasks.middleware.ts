import { Injectable } from '@nestjs/common'
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
            createCreateTasksTool({ projectId, service: this.tasks, conversationId, assertPermission: edit }),
            createUpdateTasksTool({ projectId, service: this.tasks, assertPermission: edit }),
            ...createProjectRuntimeTools(context, this.commandBus, assertPermission)
        ]
        for (const tool of tools) {
            const name = this.getToolNames().find((name) => name === tool.name)
            tool.metadata = { ...tool.metadata, toolName: PROJECT_TASK_TOOL_TITLES[name] }
            tool.verboseParsingErrors = true
        }
        return { name: PROJECT_TASKS_MIDDLEWARE, tools }
    }
}
