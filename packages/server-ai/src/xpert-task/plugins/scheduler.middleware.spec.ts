import { FollowUpTimerSource } from '../../agent-event/follow-up-timer.source'
import type { MonitorTargets } from '../monitor-targets'
import { CommandBus } from '@nestjs/cqrs'
import { convertToOpenAITool } from '@langchain/core/utils/function_calling'
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { ChatMessageEventTypeEnum, WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import { ToolParameterValidationError } from '../../shared/tools/errors'
import { CreateXpertTaskCommand, DeleteXpertTaskCommand, QueryXpertTaskCommand } from '../commands'
import { ScheduleDifferenceReports } from '../schedule-difference-reports'
import { SchedulerAgentMiddleware } from './scheduler.middleware'
import { SchedulerToolEnum } from './types'

jest.mock('@langchain/core/callbacks/dispatch', () => ({
    dispatchCustomEvent: jest.fn().mockResolvedValue(undefined)
}))

describe('SchedulerAgentMiddleware', () => {
    let commandBus: { execute: jest.Mock }
    let strategy: SchedulerAgentMiddleware
    const reports = { bind: jest.fn() }
    const timers = Object.assign(Object.create(FollowUpTimerSource.prototype) as FollowUpTimerSource, {
        set: jest.fn(),
        list: jest.fn(),
        cancel: jest.fn()
    })

    beforeEach(() => {
        commandBus = {
            execute: jest.fn()
        }
        strategy = new SchedulerAgentMiddleware(
            commandBus as unknown as CommandBus,
            reports as unknown as ScheduleDifferenceReports,
            {} as MonitorTargets,
            timers
        )
        jest.clearAllMocks()
    })

    it('exposes scheduler middleware meta and tools', async () => {
        const middleware = await Promise.resolve(strategy.createMiddleware({}, createContext()))

        expect(middleware.name).toBe('scheduler')
        expect(middleware.tools.map((tool) => tool.name)).toEqual([
            SchedulerToolEnum.CREATE_SCHEDULER,
            SchedulerToolEnum.LIST_SCHEDULER,
            SchedulerToolEnum.DELETE_SCHEDULER,
            'list_schedule_targets'
        ])
        for (const entry of middleware.tools.slice(0, 3))
            expect(JSON.stringify(convertToOpenAITool(entry).function.parameters)).not.toContain('follow_up')
        expect(strategy.meta.name).toBe('scheduler')
        expect(strategy.meta.label.en_US).toBe('Scheduler')
    })

    it('prefers middleware context xpertId when creating a task', async () => {
        commandBus.execute.mockResolvedValue({
            id: 'task-1',
            name: 'Morning briefing',
            prompt: 'Search for stock quotes',
            scheduleDescription: 'Every day at 09:00',
            timeZone: 'Asia/Shanghai'
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
        expect(dispatchCustomEvent).toHaveBeenCalledTimes(1)
        expect(dispatchCustomEvent).toHaveBeenCalledWith(
            ChatMessageEventTypeEnum.ON_CHAT_EVENT,
            expect.objectContaining({
                type: 'resource_card',
                data: expect.objectContaining({
                    description: 'Every day at 09:00 · Asia/Shanghai',
                    resource: { namespace: 'platform', type: 'scheduled-task', id: 'task-1' },
                    open: { target: 'workbench.view', viewKey: 'platform.scheduler__detail', selectionId: 'task-1' }
                })
            }),
            expect.objectContaining({ metadata: { tool_call_id: 'tool-call-1' } })
        )
    })

    it('manages one-off deadlines with the four existing object-shaped tools', async () => {
        const taskId = '59ff5567-b088-4ac8-a017-c404f431d22a'
        const deadline = { dueAt: '2030-12-01T09:00:00Z', purpose: 'Check the answer' }
        timers.set.mockResolvedValue({ timerId: taskId, dueAt: deadline.dueAt, state: 'waiting' })
        timers.list.mockResolvedValue([{ id: taskId, ...deadline, state: 'waiting' }])
        timers.cancel.mockResolvedValue({ timerId: taskId, state: 'cancelled' })
        const context = { ...createContext(), conversationId: 'conversation', threadId: 'branch' }
        const { tools } = await strategy.createMiddleware({}, context)
        expect(tools.map(({ name }) => name)).toEqual([...Object.values(SchedulerToolEnum), 'list_schedule_targets'])
        const [create, list, remove] = tools
        for (const entry of [create, list, remove]) {
            const schema = convertToOpenAITool(entry).function.parameters
            expect(schema).toMatchObject({
                type: 'object',
                properties: { mode: { enum: expect.arrayContaining(['follow_up']) } }
            })
        }
        const mode = 'follow_up'
        const created = JSON.parse(await create.invoke({ mode, ...deadline }, { metadata: { tool_call_id: 'turn-1' } }))
        expect(created).toEqual({ mode, taskId, dueAt: deadline.dueAt, state: 'waiting' })
        const pending = JSON.parse(await list.invoke({ mode }))
        expect(pending).toEqual([{ mode, taskId, ...deadline, state: 'waiting' }])
        expect(JSON.parse(await remove.invoke({ mode, taskId: pending[0].taskId }))).toEqual({
            mode,
            taskId,
            state: 'cancelled'
        })
        expect(timers.set).toHaveBeenCalledWith(context, deadline, 'turn-1')
        expect(timers.list).toHaveBeenCalledWith(context)
        expect(timers.cancel).toHaveBeenCalledWith(context, taskId)
        expect(commandBus.execute).not.toHaveBeenCalled()
    })

    it('rejects incomplete, mixed or redirected follow-up arguments before dispatch', async () => {
        const {
            tools: [create, list, remove]
        } = await strategy.createMiddleware(
            {},
            { ...createContext(), conversationId: 'conversation', threadId: 'branch' }
        )
        const deadline = { mode: 'follow_up', dueAt: '2030-12-01T09:00:00Z', purpose: 'Check the answer' }
        const taskId = '59ff5567-b088-4ac8-a017-c404f431d22a'
        for (const args of [
            { mode: 'follow_up', purpose: deadline.purpose },
            { mode: 'follow_up', dueAt: deadline.dueAt },
            { ...deadline, dueAt: '2030-12-01T09:00:00' },
            { ...deadline, schedule: '0 9 * * *' },
            { ...deadline, agentKey: 'another-agent' },
            { ...deadline, threadId: taskId },
            { ...deadline, mode: 'independent', name: 'Check', prompt: 'Check', schedule: '0 9 * * *' }
        ])
            await expect(create.invoke(args)).rejects.toThrow()
        await expect(list.invoke({ mode: 'follow_up', xpertId: 'someone-else' })).rejects.toThrow()
        await expect(remove.invoke({ mode: 'follow_up', name: 'ordinary task' })).rejects.toThrow()
        await expect(remove.invoke({ mode: 'follow_up', taskId, name: 'ordinary task' })).rejects.toThrow()
        await expect(remove.invoke({ taskId })).rejects.toThrow()
        expect(commandBus.execute).not.toHaveBeenCalled()
        expect(timers.set).not.toHaveBeenCalled()
        expect(timers.list).not.toHaveBeenCalled()
        expect(timers.cancel).not.toHaveBeenCalled()
    })

    it('keeps ordinary task lookup and deletion separate when a thread also supports follow-ups', async () => {
        const taskId = '59ff5567-b088-4ac8-a017-c404f431d22a'
        const {
            tools: [, list, remove]
        } = await strategy.createMiddleware(
            {},
            {
                ...createContext(),
                conversationId: 'conversation',
                threadId: 'branch'
            }
        )
        commandBus.execute
            .mockResolvedValueOnce([{ id: taskId, name: 'Daily report' }])
            .mockResolvedValueOnce('deleted')
        expect(JSON.parse(await list.invoke({}))).toEqual([{ id: taskId, name: 'Daily report' }])
        expect(await remove.invoke({ name: 'Daily report', taskId })).toBe('deleted')
        expect(commandBus.execute.mock.calls.map(([command]) => command.constructor)).toEqual([
            QueryXpertTaskCommand,
            DeleteXpertTaskCommand
        ])
        const {
            tools: [, unscopedList, unscopedDelete]
        } = await strategy.createMiddleware({}, createContext())
        await expect(unscopedList.invoke({ mode: 'follow_up' })).rejects.toThrow()
        await expect(unscopedDelete.invoke({ mode: 'follow_up', taskId, name: 'Daily report' })).rejects.toThrow()
        expect(commandBus.execute).toHaveBeenCalledTimes(2)
        expect(timers.list).not.toHaveBeenCalled()
        expect(timers.cancel).not.toHaveBeenCalled()
    })

    it('binds an autonomous monitor to the invoking Assistant, agent and conversation branch', async () => {
        commandBus.execute.mockResolvedValue({ id: 'task-1', name: 'Follow up', timeZone: 'UTC' })
        const context = { ...createContext(), conversationId: 'record', threadId: 'branch' }
        const middleware = await strategy.createMiddleware({}, context)
        const create = middleware.tools.find((item) => item.name === SchedulerToolEnum.CREATE_SCHEDULER)!
        const result = await create.invoke(
            {
                mode: 'current_conversation',
                name: 'Follow up',
                prompt: 'Check BOM',
                xpertId: 'elsewhere',
                agentKey: 'elsewhere'
            },
            { metadata: { tool_call_id: 'call' } }
        )
        expect(JSON.parse(String(result))).toMatchObject({ taskId: 'task-1', notify: 'new-differences' })
        expect(commandBus.execute.mock.calls[0][0]).toMatchObject({
            task: { xpertId: 'context-xpert', agentKey: 'agent-1' },
            monitor: { source: 'agent', conversationId: 'record', threadId: 'branch', requestKey: 'call' }
        })
    })

    it('creates a new conversation per run with the requested interval', async () => {
        commandBus.execute.mockResolvedValue({ id: 'new', name: 'Watch' })
        const middleware = await strategy.createMiddleware(
            {},
            { ...createContext(), conversationId: 'origin', threadId: 'thread' }
        )
        await middleware.tools[0].invoke({ mode: 'new_chat', name: 'Watch', prompt: 'Check', intervalMinutes: 7 })
        expect(commandBus.execute.mock.calls[0][0]).toMatchObject({
            monitor: {
                source: 'agent',
                conversationId: 'origin',
                threadId: 'thread',
                destination: { type: 'new_chat' },
                intervalMinutes: 7
            }
        })
    })
    it('exposes reporting without recursive scheduling during a bound monitor run', async () => {
        reports.bind.mockResolvedValueOnce(async () => 'Recorded')
        const middleware = await strategy.createMiddleware({}, createContext())
        expect(middleware.tools.map((tool) => tool.name)).toEqual(['report_schedule_differences'])
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

    it('binds scheduled execution to the host project context', async () => {
        commandBus.execute.mockResolvedValue({ id: 'task-1', name: 'Briefing' })
        const middleware = await strategy.createMiddleware({}, createContext({ projectId: 'host-project' }))
        await middleware.tools[0].invoke({ name: 'Briefing', schedule: '0 9 * * *', prompt: 'Summarize' })
        const command = commandBus.execute.mock.calls[0][0] as CreateXpertTaskCommand
        expect(command.task.projectId).toBe('host-project')
    })

    it('does not emit a receipt when creation fails', async () => {
        commandBus.execute.mockRejectedValueOnce(Error('create rejected'))
        const middleware = await strategy.createMiddleware({}, createContext())
        await expect(
            middleware.tools[0].invoke({ name: 'Briefing', schedule: '0 9 * * *', prompt: 'Summarize' })
        ).rejects.toThrow('create rejected')
        expect(dispatchCustomEvent).not.toHaveBeenCalled()
    })

    it('keeps creation successful when card delivery fails', async () => {
        commandBus.execute.mockResolvedValue({ id: 'created', name: 'Briefing', timeZone: 'UTC', status: 'scheduled' })
        jest.mocked(dispatchCustomEvent).mockRejectedValueOnce(Error('stream disconnected'))
        const middleware = await strategy.createMiddleware({}, createContext())
        await expect(
            middleware.tools[0].invoke({ name: 'Briefing', schedule: '0 9 * * *', prompt: 'Summarize' })
        ).resolves.toBe('Scheduler creation completed!')
        expect(commandBus.execute).toHaveBeenCalledTimes(1)
        expect(dispatchCustomEvent).toHaveBeenCalledTimes(1)
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

function createContext(overrides: Partial<{ xpertId?: string; projectId?: string }> = {}) {
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
