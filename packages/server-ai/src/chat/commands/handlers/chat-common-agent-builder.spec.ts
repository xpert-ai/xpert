jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { AIMessage, HumanMessage } from '@langchain/core/messages'
import { BindToolsInput } from '@langchain/core/language_models/chat_models'
import { FakeListChatModel } from '@langchain/core/utils/testing'
import { InMemoryStore } from '@langchain/langgraph'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { AiProviderRole, IUser, IXpertProject } from '@xpert-ai/contracts'
import { AgentMiddlewareRegistry, AgentMiddlewareRuntimeApi, RequestContext } from '@xpert-ai/plugin-sdk'
import { randomUUID } from 'node:crypto'
import { Subscriber } from 'rxjs'
import { ConversationTitleService, CreateMemoryStoreCommand } from '../../../shared'
import { AgentMiddlewareRuntimeService } from '../../../shared/agent/middleware-runtime'
import { XpertProjectService } from '../../../xpert-project/project.service'
import { XpertProjectTaskService } from '../../../xpert-project/services/project-task.service'
import { ProjectTasksMiddleware } from '../../../xpert-project/plugins/project-tasks/project-tasks.middleware'
import { PROJECT_TASKS_ICON, ProjectToolEnum } from '../../../xpert-project/plugins/project-tasks/constants'
import { GetProjectRuntimeTaskCommand } from '../../../xpert-project/runtime/project-task-dispatch.command'
import { ChatCommonCommand } from '../chat-common.command'
import { ChatCommonAgentBuilder } from './chat-common-agent-builder'

class ProjectTestModel extends FakeListChatModel {
    boundTools: BindToolsInput[] = []
    constructor(private readonly taskId: string) {
        super({ responses: [] })
    }
    bindTools(tools: BindToolsInput[]) {
        this.boundTools = tools
        return this
    }
    async _generate() {
        const message =
            this.i++ === 0
                ? new AIMessage({
                      content: '',
                      tool_calls: [{ id: 'lookup', name: ProjectToolEnum.GetTask, args: { taskId: this.taskId } }]
                  })
                : new AIMessage('Task read')
        return { generations: [{ message, text: typeof message.content === 'string' ? message.content : '' }] }
    }
}

it('loads project tools through the registered middleware and executes them in the general-agent graph', async () => {
    const projectId = randomUUID(),
        conversationId = randomUUID(),
        executionId = randomUUID(),
        taskId = randomUUID(),
        userId = randomUUID()
    const identity = jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(userId)
    try {
        const execute = jest.fn(async (command: object) => {
            if (command instanceof CreateMemoryStoreCommand) return new InMemoryStore()
            if (command instanceof GetProjectRuntimeTaskCommand) return { id: taskId, status: 'todo' }
            throw new Error(`Unexpected command ${command.constructor.name}`)
        })
        const commands = Object.assign(Object.create(CommandBus.prototype) as CommandBus, { execute })
        const permission = jest.fn(async () => undefined)
        const projects = Object.assign(Object.create(XpertProjectService.prototype) as XpertProjectService, {
            assertToolPermission: permission
        })
        const strategy = new ProjectTasksMiddleware(
            commands,
            projects,
            Object.create(XpertProjectTaskService.prototype) as XpertProjectTaskService
        )
        const middlewareCreate = jest.spyOn(strategy, 'createMiddleware')
        const registry = new AgentMiddlewareRegistry(
            Object.create(DiscoveryService.prototype) as DiscoveryService,
            new Reflector()
        )
        registry.upsert(strategy)
        const runtimeApi: AgentMiddlewareRuntimeApi = {
            createModelClient: async () => {
                throw new Error('unused')
            },
            wrapWorkflowNodeExecution: async () => {
                throw new Error('unused')
            }
        }
        const scopedApi = jest.fn(() => runtimeApi)
        const runtime = Object.assign(
            Object.create(AgentMiddlewareRuntimeService.prototype) as AgentMiddlewareRuntimeService,
            { createScopedApi: scopedApi }
        )
        const model = new ProjectTestModel(taskId)
        const queries = Object.assign(Object.create(QueryBus.prototype) as QueryBus, {
            execute: jest.fn(async () => model)
        })
        const project: IXpertProject = {
            id: projectId,
            ownerId: userId,
            name: 'Project',
            status: 'active',
            workspaceId: randomUUID(),
            xperts: [],
            copilotModel: {
                model: 'test',
                copilot: { role: AiProviderRole.Primary, modelProvider: { providerName: 'test' } }
            }
        }
        const builder = new ChatCommonAgentBuilder(
            undefined,
            projects,
            commands,
            queries,
            Object.create(ConversationTitleService.prototype) as ConversationTitleService,
            registry,
            runtime
        )
        const command = new ChatCommonCommand(
            { action: 'send', projectId, message: { input: { input: 'Read task' } } },
            {
                tenantId: randomUUID(),
                organizationId: randomUUID(),
                user: { id: userId } as IUser
            }
        )
        const graph = await builder.createReactAgent(
            command,
            project,
            { id: executionId, threadId: 'thread-1' },
            new AbortController(),
            new Subscriber(),
            conversationId,
            []
        )
        const output = await graph.invoke(
            { title: 'Project', messages: [new HumanMessage('Read task')] },
            { configurable: { thread_id: 'thread-1', executionId } }
        )
        expect(middlewareCreate).toHaveBeenCalledWith(
            {},
            expect.objectContaining({
                projectId,
                conversationId,
                executionId,
                userId,
                callerType: 'project_agent',
                agentKey: 'general_agent',
                runtime: runtimeApi
            })
        )
        const middleware = middlewareCreate.mock.results[0].value
        expect(middleware.tools).toHaveLength(6)
        expect(model.boundTools).toEqual(middleware.tools)
        expect(middleware.tools.every((tool) => tool.metadata.middlewareIcon === PROJECT_TASKS_ICON)).toBe(true)
        expect(permission).toHaveBeenCalledWith(projectId, 'view')
        expect(execute).toHaveBeenCalledWith(new GetProjectRuntimeTaskCommand(projectId, taskId))
        expect(output.messages.at(-1).content).toBe('Task read')
    } finally {
        identity.mockRestore()
    }
})
