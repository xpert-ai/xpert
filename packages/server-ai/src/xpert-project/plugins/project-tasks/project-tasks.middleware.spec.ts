jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
jest.mock('@langchain/core/callbacks/dispatch', () => ({ dispatchCustomEvent: jest.fn() }))
import { CommandBus } from '@nestjs/cqrs'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { ConflictException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { GraphInterrupt } from '@langchain/langgraph'
import { TaskControlRejected } from '@xpert-ai/server-core'
import { AgentInvocationAuthorizationError, AgentInvocationError } from '../../../agent-invocation/invocation-errors'
import { ExecutionCancelledError } from '../../../execution-control/execution-cancelled.error'
import i18next from 'i18next'
import en from '../../../i18n/en.json'
import { randomUUID } from 'node:crypto'
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages'
import { FakeStreamingChatModel } from '../../../shared/agent/fake-streaming-chat-model'
import type { ModelRequest } from '@xpert-ai/plugin-sdk'
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { isUserAddableAgentMiddleware, IWFNMiddleware, TXpertGraph, WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import { AgentMiddlewareRegistry, IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { getAgentMiddlewares } from '../../../shared/agent/middleware'
import { XpertProjectService } from '../../project.service'
import { XpertProjectTaskService } from '../../services/project-task.service'
import { DispatchProjectTaskCommand, GetProjectRuntimeTaskCommand } from '../../runtime/project-task-dispatch.command'
import { ProjectTasksMiddleware } from './project-tasks.middleware'
import { PROJECT_TASKS_ICON, PROJECT_TASKS_MIDDLEWARE, ProjectToolEnum } from './constants'

function fixture() {
    const execute = jest.fn(async (_command: object) => ({ status: 'queued' }))
    const commands = Object.assign(Object.create(CommandBus.prototype) as CommandBus, { execute })
    const permission = jest.fn(async (_id: string, _action: string) => undefined)
    const projects = Object.assign(Object.create(XpertProjectService.prototype) as XpertProjectService, {
        assertToolPermission: permission
    })
    const tasks = Object.assign(Object.create(XpertProjectTaskService.prototype) as XpertProjectTaskService, {
        findAll: jest.fn(async () => ({ items: [] })),
        observeExecutions: jest.fn(async () => []),
        createTask: jest.fn(),
        linkConversation: jest.fn(),
        updateTaskSteps: jest.fn(),
        listTaskRelations: jest.fn(),
        updateExecution: jest.fn(),
        translate: jest.fn(async () => 'Update tasks')
    })
    const strategy = new ProjectTasksMiddleware(commands, projects, tasks)
    const registry = new AgentMiddlewareRegistry(
        Object.create(DiscoveryService.prototype) as DiscoveryService,
        new Reflector()
    )
    registry.upsert(strategy)
    const context: IAgentMiddlewareContext = {
        tenantId: randomUUID(),
        organizationId: randomUUID(),
        userId: randomUUID(),
        projectId: randomUUID(),
        conversationId: randomUUID(),
        executionId: randomUUID(),
        callerType: 'project_agent',
        agentKey: 'general_agent',
        threadId: 'project-thread',
        node: {
            id: 'tasks',
            type: WorkflowNodeTypeEnum.MIDDLEWARE,
            provider: PROJECT_TASKS_MIDDLEWARE,
            key: 'tasks',
            title: 'Tasks'
        },
        tools: new Map(),
        runtime: {
            wrapWorkflowNodeExecution: async () => {
                throw new Error('unused')
            },
            createModelClient: async () => {
                throw new Error('unused')
            }
        }
    }
    return { strategy, registry, context, execute, permission, tasks }
}

const dispatchInput = () => ({
    taskId: randomUUID(),
    bindingId: randomUUID(),
    expectedRevision: 1
})
const createInput = () => ({ tasks: [{ name: 'Task', requirements: ['Evidence'], steps: [] }] })

function longHistoryFixture() {
    const f = fixture()
    const taskIds = [randomUUID(), randomUUID()]
    const middleware = f.strategy.createMiddleware({}, f.context)
    const messages = [
        new HumanMessage('x'.repeat(65000)),
        new ToolMessage({
            name: ProjectToolEnum.CreateTasks,
            tool_call_id: 'historical-create',
            status: 'success',
            content: JSON.stringify({ tasks: taskIds.map((id) => ({ id, projectId: f.context.projectId })) })
        })
    ]
    const request = {
        model: new FakeStreamingChatModel({ sleep: 0 }),
        messages,
        tools: middleware.tools,
        state: { messages },
        runtime: {}
    } as ModelRequest
    const handler = jest.fn(async (_request: ModelRequest) => new AIMessage('ok'))
    return { ...f, taskIds, middleware, request, messages, handler }
}

describe('historical task read isolation', () => {
    beforeAll(async () => {
        await i18next.init({ lng: 'en', resources: { en: { 'server-ai': en } } })
    })

    it('keeps a successful observation and an unavailable task in matching tool pairs without mutating history', async () => {
        const f = longHistoryFixture()
        const before = JSON.stringify(f.messages)
        f.execute
            .mockImplementationOnce(async () => ({
                status: 'todo',
                id: f.taskIds[0],
                projectId: f.context.projectId,
                executions: [],
                requirements: ['Preserve independent review'],
                decisionOptions: [{ decisionRef: 'current-reference' }]
            }))
            .mockRejectedValueOnce(new NotFoundException('sensitive-internal-detail'))
        await f.middleware.wrapModelCall(f.request, f.handler)
        expect(f.permission).toHaveBeenCalledWith(f.context.projectId, 'view')
        expect(f.execute.mock.calls.map(([command]) => command)).toEqual(
            f.taskIds.map((id) => new GetProjectRuntimeTaskCommand(f.context.projectId, id))
        )
        expect(f.handler).toHaveBeenCalledTimes(1)
        const messages = f.handler.mock.calls[0][0].messages
        const calls = messages.at(-3)
        expect(calls).toBeInstanceOf(AIMessage)
        if (!(calls instanceof AIMessage)) throw new Error('Expected host observation call')
        expect(messages.at(-2)).toMatchObject({ status: 'success', tool_call_id: calls.tool_calls[0].id })
        expect(messages.at(-2).content).toContain('current-reference')
        expect(messages.at(-1)).toMatchObject({ status: 'error', tool_call_id: calls.tool_calls[1].id })
        expect(JSON.parse(String(messages.at(-1).content))).toMatchObject({
            taskId: f.taskIds[1],
            reason: 'http_404',
            message: expect.stringContaining('Earlier snapshots are historical')
        })
        expect(JSON.stringify(messages)).not.toContain('sensitive-internal-detail')
        expect(JSON.stringify(f.messages)).toBe(before)
    })

    it.each([new NotFoundException(), new ConflictException(), new AgentInvocationError('ProviderUnavailable')])(
        'reports missing evidence when all historical reads fail (%s)',
        async (error) => {
            const f = longHistoryFixture()
            f.execute.mockRejectedValue(error)
            await f.middleware.wrapModelCall(f.request, f.handler)
            expect(f.execute).toHaveBeenCalledTimes(2)
            expect(f.handler).toHaveBeenCalledTimes(1)
            const observations = f.handler.mock.calls[0][0].messages.slice(-2)
            expect(observations.every((message) => message instanceof ToolMessage && message.status === 'error')).toBe(
                true
            )
            expect(observations.map((message) => JSON.parse(String(message.content)).taskId)).toEqual(f.taskIds)
        }
    )

    it('does not read tasks or call the model when the project permission gate denies access', async () => {
        const f = longHistoryFixture(),
            error = new ForbiddenException()
        f.permission.mockRejectedValue(error)
        await expect(f.middleware.wrapModelCall(f.request, f.handler)).rejects.toBe(error)
        expect(f.execute).not.toHaveBeenCalled()
        expect(f.handler).not.toHaveBeenCalled()
    })

    it.each([
        new UnauthorizedException(),
        new ForbiddenException(),
        new AgentInvocationError('InvalidScope'),
        new AgentInvocationAuthorizationError(new Error('revoked')),
        new GraphInterrupt(),
        new ExecutionCancelledError(randomUUID(), 'cancelled'),
        new TaskControlRejected('paused'),
        Object.assign(new Error('aborted'), { name: 'AbortError' }),
        new Error('unexpected implementation failure')
    ])('propagates authorization, control and unexpected failures (%s)', async (error) => {
        const f = longHistoryFixture()
        f.execute.mockResolvedValueOnce({ status: 'todo' }).mockRejectedValueOnce(error)
        await expect(f.middleware.wrapModelCall(f.request, f.handler)).rejects.toBe(error)
        expect(f.handler).not.toHaveBeenCalled()
    })
})

describe('built-in Project Tasks Plugin', () => {
    it('rehydrates bounded authorized tasks for long history without dispatching or deciding', async () => {
        const f = fixture(),
            taskId = randomUUID()
        const middleware = f.strategy.createMiddleware({}, f.context)
        const prior = new ToolMessage({
            name: ProjectToolEnum.CreateTasks,
            tool_call_id: 'old',
            status: 'success',
            content: JSON.stringify({ tasks: [{ id: taskId, projectId: f.context.projectId }] })
        })
        const messages = [new HumanMessage('x'.repeat(65000)), prior]
        f.execute.mockImplementation(async () => ({
            status: 'todo',
            id: taskId,
            projectId: f.context.projectId,
            executions: [],
            requirements: ['Read independent negative findings'],
            decisionOptions: [{ decisionRef: 'bound-reference' }]
        }))
        const request = {
            model: new FakeStreamingChatModel({ sleep: 0 }),
            messages,
            tools: middleware.tools,
            state: { messages },
            runtime: {}
        } as ModelRequest
        const handler = jest.fn().mockResolvedValue(new AIMessage('ok'))
        await middleware.wrapModelCall(request, handler)
        expect(f.permission).toHaveBeenCalledWith(f.context.projectId, 'view')
        expect(f.execute).toHaveBeenCalledWith(new GetProjectRuntimeTaskCommand(f.context.projectId, taskId))
        expect(f.execute).toHaveBeenCalledTimes(1)
        const projected = handler.mock.calls[0][0].messages
        expect(projected[0]).toBe(messages[0])
        expect(projected.at(-1).content).toContain('bound-reference')
        expect(messages).toHaveLength(2)
        f.execute.mockClear()
        const failure = new ToolMessage({
            tool_call_id: 'failed-decision',
            name: ProjectToolEnum.DecideTask,
            status: 'error',
            content: 'Original Computer unavailable; do not repeat acceptance without resolving this condition.'
        })
        await middleware.wrapModelCall({ ...request, messages: [...messages, failure] }, handler)
        expect(f.execute).not.toHaveBeenCalled()
        expect(handler.mock.calls.at(-1)[0].messages.at(-1)).toBe(failure)
        await middleware.wrapModelCall({ ...request, tools: [] }, handler)
        expect(f.execute).not.toHaveBeenCalled()
        f.permission.mockRejectedValueOnce(new Error('Revoked'))
        await expect(middleware.wrapModelCall(request, handler)).rejects.toThrow('Revoked')
        expect(f.execute).not.toHaveBeenCalled()
    })
    it('does not use a human or stale Assistant identity as the Project general agent default', async () => {
        const { strategy, context, tasks } = fixture()
        context.xpertId = randomUUID()
        tasks.createTask.mockImplementation(async (_projectId, input) => ({ ...input, id: randomUUID(), revision: 1 }))
        const tool = strategy
            .createMiddleware({}, context)
            .tools.find((item) => item.name === ProjectToolEnum.CreateTasks)
        await tool.invoke(createInput())
        expect(tasks.createTask).toHaveBeenCalledWith(
            context.projectId,
            expect.objectContaining({ assigneeXpertId: undefined })
        )
        const override = { ...createInput(), defaultAssigneeXpertId: context.userId }
        await expect(tool.invoke(override)).rejects.toThrow()
        expect(tasks.createTask).toHaveBeenCalledTimes(1)
    })
    it('defaults task creation to the trusted Assistant while preserving an explicit owner', async () => {
        const { strategy, context, tasks } = fixture()
        context.callerType = 'xpert'
        context.xpertId = randomUUID()
        tasks.createTask.mockImplementation(async (_projectId, input) => ({ ...input, id: randomUUID(), revision: 1 }))
        const tool = strategy
            .createMiddleware({}, context)
            .tools.find((item) => item.name === ProjectToolEnum.CreateTasks)
        await tool.invoke(createInput())
        expect(tasks.createTask).toHaveBeenLastCalledWith(
            context.projectId,
            expect.objectContaining({
                assigneeXpertId: context.xpertId
            })
        )
        const explicitOwner = randomUUID()
        await tool.invoke({ tasks: [{ ...createInput().tasks[0], assigneeXpertId: explicitOwner }] })
        expect(tasks.createTask).toHaveBeenLastCalledWith(
            context.projectId,
            expect.objectContaining({
                assigneeXpertId: explicitOwner
            })
        )
    })
    it('records task creation without a duplicate resource card or legacy Computer component', async () => {
        const { strategy, context, tasks } = fixture()
        const id = randomUUID()
        tasks.createTask.mockResolvedValue({
            id,
            name: 'Task',
            projectId: context.projectId,
            revision: 1,
            status: 'todo'
        })
        jest.mocked(dispatchCustomEvent).mockClear()
        const tool = strategy
            .createMiddleware({}, context)
            .tools.find((item) => item.name === ProjectToolEnum.CreateTasks)
        const result = await tool.invoke(createInput(), { configurable: { tool_call_id: 'create-task' } })
        expect(result).toMatchObject({ tasks: [{ id, status: 'todo' }] })
        expect(tasks.linkConversation).toHaveBeenCalledWith(
            context.projectId,
            id,
            expect.objectContaining({ relationType: 'origin' })
        )
        expect(dispatchCustomEvent).not.toHaveBeenCalled()
    })
    it('is discovered as a selectable built-in middleware with localized tools and no expert directory tool', () => {
        const { registry, strategy, context } = fixture()
        expect(registry.get(PROJECT_TASKS_MIDDLEWARE)).toBe(strategy)
        expect(registry.listRegistrations()[0].source.kind).toBe('builtin')
        expect(isUserAddableAgentMiddleware(strategy.meta)).toBe(true)
        const middleware = strategy.createMiddleware({}, context)
        expect(middleware.tools.map((tool) => tool.name).sort()).toEqual(strategy.getToolNames().sort())
        expect(strategy.getToolNames()).not.toContain('project_list_experts')
        for (const tool of middleware.tools) {
            expect(tool.metadata.toolName).toEqual({ en_US: expect.any(String), zh_Hans: expect.any(String) })
            expect(tool.verboseParsingErrors).toBe(true)
        }
    })

    it('keeps tool schemas discoverable without a project, but rejects every execution before service access', async () => {
        const { strategy, context, permission, execute, tasks } = fixture()
        const middleware = strategy.createMiddleware({}, { ...context, projectId: undefined })
        const inputs = {
            [ProjectToolEnum.ListTasks]: {},
            [ProjectToolEnum.RecoverDelivery]: { taskId: randomUUID(), executionId: randomUUID(), expectedRevision: 1 },
            [ProjectToolEnum.CreateTasks]: createInput(),
            [ProjectToolEnum.UpdateTasks]: { tasks: [{ id: randomUUID(), steps: [] }] },
            [ProjectToolEnum.UpdatePlan]: { taskId: randomUUID(), expectedRevision: 1 },
            [ProjectToolEnum.DecideTask]: {
                decisionRef: `pd1/${randomUUID()}/${randomUUID()}/${'a'.repeat(64)}`,
                outcome: 'accept',
                rationale: 'Inspected the current implementation',
                checks: ['Verified test evidence']
            },
            [ProjectToolEnum.DispatchTask]: dispatchInput(),
            [ProjectToolEnum.GetTask]: { taskId: randomUUID() },
            [ProjectToolEnum.ReadResult]: { taskId: randomUUID(), executionId: randomUUID(), expectedRevision: 1 },
            [ProjectToolEnum.ListRuntimes]: {}
        }
        for (const name of Object.values(ProjectToolEnum)) {
            const tool = middleware.tools.find((item) => item.name === name)
            await expect(tool.invoke(inputs[name])).rejects.toMatchObject({ status: 403 })
        }
        expect(permission).not.toHaveBeenCalled()
        expect(execute).not.toHaveBeenCalled()
        expect(tasks.findAll).not.toHaveBeenCalled()
        expect(tasks.createTask).not.toHaveBeenCalled()
        expect(tasks.updateTaskSteps).not.toHaveBeenCalled()
    })

    it('rejects scope in Plugin options and in model arguments', async () => {
        const { strategy, context, permission } = fixture()
        expect(() => strategy.createMiddleware({ projectId: randomUUID() }, context)).toThrow()
        const middleware = strategy.createMiddleware({}, context)
        for (const [name, input] of [
            [ProjectToolEnum.ListTasks, { projectId: randomUUID() }],
            [ProjectToolEnum.CreateTasks, { tasks: [{ ...createInput().tasks[0], status: 'done' }] }],
            [ProjectToolEnum.UpdateTasks, { tasks: [{ id: randomUUID(), steps: [], invocationId: randomUUID() }] }],
            [ProjectToolEnum.GetTask, { taskId: randomUUID(), userId: randomUUID() }]
        ] as const) {
            await expect(middleware.tools.find((tool) => tool.name === name).invoke(input)).rejects.toThrow()
        }
        expect(permission).not.toHaveBeenCalled()
    })

    it.each(['project_agent', 'xpert'] as const)('delegates with host-owned %s identity', async (callerType) => {
        const { strategy, context, execute, permission } = fixture()
        const caller = {
            ...context,
            callerType,
            ...(callerType === 'xpert' ? { xpertId: randomUUID(), agentKey: 'assistant' } : {})
        }
        const middleware = strategy.createMiddleware({}, caller)
        const input = dispatchInput()
        await middleware.tools
            .find((tool) => tool.name === ProjectToolEnum.DispatchTask)
            .invoke(input, {
                configurable: { executionId: context.executionId, tool_call_id: 'call-1' }
            })
        expect(permission).toHaveBeenCalledWith(context.projectId, 'edit')
        expect(execute).toHaveBeenCalledWith(expect.any(DispatchProjectTaskCommand))
        expect(execute.mock.calls[0][0]).toMatchObject({
            projectId: context.projectId,
            caller: {
                type: callerType,
                executionId: context.executionId,
                conversationId: context.conversationId,
                threadId: context.threadId,
                agentKey: caller.agentKey,
                ...(caller.xpertId ? { xpertId: caller.xpertId } : {})
            }
        })
    })

    it('rechecks access on every invocation and does not query results after revocation', async () => {
        const { strategy, context, execute, permission } = fixture()
        const tool = strategy.createMiddleware({}, context).tools.find((tool) => tool.name === ProjectToolEnum.GetTask)
        const input = { taskId: randomUUID() }
        await tool.invoke(input)
        expect(execute).toHaveBeenCalledWith(expect.any(GetProjectRuntimeTaskCommand))
        permission.mockRejectedValueOnce(new Error('revoked'))
        await expect(tool.invoke(input)).rejects.toThrow('revoked')
        expect(execute).toHaveBeenCalledTimes(1)
    })

    it('uses the normal Plugin node tool toggles, user preferences and middleware icon inheritance', async () => {
        const { strategy, registry, context } = fixture()
        const entity: IWFNMiddleware = { ...context.node, tools: { project_dispatch_task: false } }
        const graph: TXpertGraph = {
            nodes: [{ type: 'workflow', key: 'tasks', position: { x: 0, y: 0 }, entity }],
            connections: [{ key: 'connection', type: 'workflow', from: 'assistant', to: 'tasks' }]
        }
        const [middleware] = await getAgentMiddlewares(graph, { key: 'assistant' }, registry, context, {
            toolPreferences: {
                version: 1,
                middlewares: {
                    tasks: { provider: PROJECT_TASKS_MIDDLEWARE, disabledTools: [ProjectToolEnum.CreateTasks] }
                }
            }
        })
        expect(middleware.tools.map((tool) => tool.name).sort()).toEqual(
            strategy
                .getToolNames()
                .filter((name) => name !== ProjectToolEnum.DispatchTask && name !== ProjectToolEnum.CreateTasks)
                .sort()
        )
        expect(middleware.tools.every((tool) => tool.metadata.middlewareIcon === PROJECT_TASKS_ICON)).toBe(true)
    })

    it('keeps Runtime status ownership when an Assistant updates task steps', async () => {
        const { strategy, context, tasks } = fixture()
        const taskId = randomUUID()
        tasks.updateTaskSteps.mockResolvedValue([{ id: taskId, steps: [{ status: 'done' }] }])
        tasks.listTaskRelations.mockResolvedValue({
            executions: [{ id: randomUUID(), agentExecutionId: context.executionId, invocationId: randomUUID() }]
        })
        const tool = strategy
            .createMiddleware({}, context)
            .tools.find((tool) => tool.name === ProjectToolEnum.UpdateTasks)
        await tool.invoke(
            { tasks: [{ id: taskId, steps: [{ stepIndex: 1, status: 'done' }] }] },
            { configurable: { executionId: context.executionId } }
        )
        expect(tasks.updateTaskSteps).toHaveBeenCalled()
        expect(tasks.updateExecution).not.toHaveBeenCalled()
    })
})
