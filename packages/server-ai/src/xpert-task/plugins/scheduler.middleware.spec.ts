import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { ChatMessageEventTypeEnum, WorkflowNodeTypeEnum } from '@metad/contracts'
import { ToolParameterValidationError } from '../../shared/tools/errors'
import { CreateXpertTaskCommand, DeleteXpertTaskCommand, QueryXpertTaskCommand } from '../commands'
import { SchedulerAgentMiddleware } from './scheduler.middleware'
import { SchedulerToolEnum } from './types'

jest.mock('@langchain/core/callbacks/dispatch', () => ({
    dispatchCustomEvent: jest.fn().mockResolvedValue(undefined)
}))

describe('SchedulerAgentMiddleware', () => {
    let commandBus: { execute: jest.Mock }
    let strategy: SchedulerAgentMiddleware

    beforeEach(() => {
        commandBus = {
            execute: jest.fn()
        }
        strategy = new SchedulerAgentMiddleware(commandBus as any)
        jest.clearAllMocks()
    })

    it('exposes scheduler middleware meta and tools', async () => {
        const middleware = await Promise.resolve(strategy.createMiddleware({}, createContext()))

        expect(middleware.name).toBe('scheduler')
        expect(middleware.tools.map((tool) => tool.name)).toEqual([
            SchedulerToolEnum.CREATE_SCHEDULER,
            SchedulerToolEnum.LIST_SCHEDULER,
            SchedulerToolEnum.DELETE_SCHEDULER
        ])
        expect(strategy.meta.name).toBe('scheduler')
        expect(strategy.meta.label.en_US).toBe('Scheduler')
    })

    it('prefers middleware context xpertId when creating a task', async () => {
        commandBus.execute.mockResolvedValue({
            id: 'task-1',
            name: 'Morning briefing',
            prompt: 'Search for stock quotes'
        })

        const middleware = await Promise.resolve(strategy.createMiddleware({}, createContext()))
        const createTask = middleware.tools.find((tool) => tool.name === SchedulerToolEnum.CREATE_SCHEDULER)!

        const result = await createTask.invoke(
            {
                name: 'Morning briefing',
                schedule: '0 9 * * *',
                xpertId: 'input-xpert',
                agentKey: 'task-to-email',
                prompt: 'Search for stock quotes'
            },
            {
                metadata: {
                    tool_call_id: 'tool-call-1'
                }
            }
        )

        expect(result).toBe('Scheduler creation completed!')
        expect(commandBus.execute).toHaveBeenCalledTimes(1)

        const command = commandBus.execute.mock.calls[0][0] as CreateXpertTaskCommand
        expect(command).toBeInstanceOf(CreateXpertTaskCommand)
        expect(command.task.xpertId).toBe('context-xpert')
        expect(command.task.agentKey).toBe('task-to-email')
        expect(dispatchCustomEvent).toHaveBeenCalledWith(
            ChatMessageEventTypeEnum.ON_TOOL_MESSAGE,
            expect.objectContaining({
                id: 'tool-call-1',
                toolset: 'scheduler'
            })
        )
    })

    it('rejects invalid cron expressions when creating a task', async () => {
        const middleware = await Promise.resolve(strategy.createMiddleware({}, createContext()))
        const createTask = middleware.tools.find((tool) => tool.name === SchedulerToolEnum.CREATE_SCHEDULER)!

        await expect(
            createTask.invoke({
                name: 'Morning briefing',
                schedule: 'invalid-cron',
                prompt: 'Search for stock quotes'
            })
        ).rejects.toThrow(ToolParameterValidationError)
        expect(commandBus.execute).not.toHaveBeenCalled()
    })

    it('uses input xpertId fallback when listing tasks without runtime context', async () => {
        commandBus.execute.mockResolvedValue([
            {
                id: 'task-1',
                name: 'Morning briefing',
                prompt: 'Search for stock quotes',
                status: 'scheduled',
                job: {
                    nextDate: '2026-04-03T09:00:00.000Z'
                }
            }
        ])

        const middleware = await Promise.resolve(strategy.createMiddleware({}, createContext({ xpertId: undefined })))
        const listTask = middleware.tools.find((tool) => tool.name === SchedulerToolEnum.LIST_SCHEDULER)!

        const result = await listTask.invoke(
            {
                xpertId: 'input-xpert'
            },
            {
                metadata: {
                    tool_call_id: 'tool-call-2'
                }
            }
        )

        const command = commandBus.execute.mock.calls[0][0] as QueryXpertTaskCommand
        expect(command).toBeInstanceOf(QueryXpertTaskCommand)
        expect(command.xpertId).toBe('input-xpert')
        expect(result).toBe(
            JSON.stringify([
                {
                    id: 'task-1',
                    name: 'Morning briefing',
                    prompt: 'Search for stock quotes',
                    status: 'scheduled'
                }
            ])
        )
        expect(dispatchCustomEvent).toHaveBeenCalledWith(
            ChatMessageEventTypeEnum.ON_TOOL_MESSAGE,
            expect.objectContaining({
                id: 'tool-call-2',
                toolset: 'scheduler'
            })
        )
    })

    it('delegates task deletion by name', async () => {
        commandBus.execute.mockResolvedValue(`Task 'Morning briefing' deleted`)

        const middleware = await Promise.resolve(strategy.createMiddleware({}, createContext()))
        const deleteTask = middleware.tools.find((tool) => tool.name === SchedulerToolEnum.DELETE_SCHEDULER)!

        const result = await deleteTask.invoke({
            name: 'Morning briefing'
        })

        expect(result).toBe(`Task 'Morning briefing' deleted`)
        const command = commandBus.execute.mock.calls[0][0] as DeleteXpertTaskCommand
        expect(command).toBeInstanceOf(DeleteXpertTaskCommand)
        expect(command.name).toBe('Morning briefing')
    })
})

function createContext(overrides: Partial<{ xpertId?: string }> = {}) {
    return {
        tenantId: 'tenant-1',
        userId: 'user-1',
        xpertId: 'context-xpert',
        agentKey: 'agent-1',
        node: {
            id: 'middleware-node',
            key: 'Middleware_scheduler',
            type: WorkflowNodeTypeEnum.MIDDLEWARE,
            provider: 'scheduler',
            options: {}
        } as any,
        tools: new Map(),
        ...overrides
    } as any
}
