jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
jest.mock('@langchain/core/callbacks/dispatch', () => ({ dispatchCustomEvent: jest.fn() }))
import { CommandBus } from '@nestjs/cqrs'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { randomUUID } from 'node:crypto'
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

describe('built-in Project Tasks Plugin', () => {
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
    it('is discovered as a selectable built-in middleware with seven localized tools', () => {
        const { registry, strategy, context } = fixture()
        expect(registry.get(PROJECT_TASKS_MIDDLEWARE)).toBe(strategy)
        expect(registry.listRegistrations()[0].source.kind).toBe('builtin')
        expect(isUserAddableAgentMiddleware(strategy.meta)).toBe(true)
        const middleware = strategy.createMiddleware({}, context)
        expect(middleware.tools.map((tool) => tool.name)).toEqual(strategy.getToolNames())
        for (const tool of middleware.tools) {
            expect(tool.metadata.toolName).toEqual({ en_US: expect.any(String), zh_Hans: expect.any(String) })
            expect(tool.verboseParsingErrors).toBe(true)
        }
    })

    it('keeps tool schemas discoverable without a project, but rejects every execution before service access', async () => {
        const { strategy, context, permission, execute, tasks } = fixture()
        const middleware = strategy.createMiddleware({}, { ...context, projectId: undefined })
        const inputs = [
            {},
            createInput(),
            { tasks: [{ id: randomUUID(), steps: [] }] },
            {
                taskId: randomUUID(),
                expectedRevision: 1,
                implementationExecutionId: randomUUID(),
                specificationDigest: `sha256:${'a'.repeat(64)}`,
                evidence: [{ type: 'invocation_result', invocationId: randomUUID(), revision: 1 }],
                outcome: 'accept',
                rationale: 'Inspected the current implementation',
                checks: ['Verified test evidence']
            },
            dispatchInput(),
            { taskId: randomUUID() },
            {}
        ]
        for (let index = 0; index < middleware.tools.length; index++) {
            await expect(middleware.tools[index].invoke(inputs[index])).rejects.toThrow()
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
        expect(middleware.tools.map((tool) => tool.name)).toEqual(
            strategy
                .getToolNames()
                .filter((name) => name !== ProjectToolEnum.DispatchTask && name !== ProjectToolEnum.CreateTasks)
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
