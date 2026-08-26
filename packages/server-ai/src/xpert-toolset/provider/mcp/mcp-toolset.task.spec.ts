import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { ChatMessageEventTypeEnum } from '@xpert-ai/contracts'
import type { McpConsumerTask, McpConsumerTaskStart, McpConsumerTaskWaitOptions } from '../../../mcp-consumer'
import { MCPToolset } from './mcp-toolset'

jest.mock('@langchain/core/callbacks/dispatch', () => ({
    dispatchCustomEvent: jest.fn().mockResolvedValue(undefined)
}))

describe('MCPToolset remote task lifecycle', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('publishes working and completed task states to the ChatKit step stream', async () => {
        const started = workingTask()
        const completed = completedTask()
        const wait = jest.fn(async (_started: McpConsumerTaskStart, options: McpConsumerTaskWaitOptions) => {
            await options.onStatus?.(started)
            await options.onStatus?.(completed)
            return completed
        })
        const result = { content: [{ type: 'text', text: 'done' }] }
        const toolset = createToolset({
            tasks: {
                start: jest.fn().mockResolvedValue(started),
                wait,
                result: jest.fn().mockReturnValue(result)
            }
        })

        await expect(toolset.callMcpTaskTool('index', {}, 'generic')).resolves.toBe(result)
        expect(dispatchCustomEvent).toHaveBeenNthCalledWith(
            1,
            ChatMessageEventTypeEnum.ON_TOOL_MESSAGE,
            expect.objectContaining({
                id: 'mcp-task:task-1',
                status: 'running',
                data: expect.objectContaining({ status: 'working', progress: 0.25 })
            })
        )
        expect(dispatchCustomEvent).toHaveBeenNthCalledWith(
            2,
            ChatMessageEventTypeEnum.ON_TOOL_MESSAGE,
            expect.objectContaining({
                id: 'mcp-task:task-1',
                status: 'success',
                data: expect.objectContaining({ status: 'completed', progress: 1 })
            })
        )
    })

    it('marks the visible task state cancelled when the conversation aborts', async () => {
        const controller = new AbortController()
        const started = workingTask()
        const wait = jest.fn(async (_started: McpConsumerTaskStart, options: McpConsumerTaskWaitOptions) => {
            await options.onStatus?.(started)
            controller.abort()
            throw new Error('aborted')
        })
        const toolset = createToolset({
            tasks: {
                start: jest.fn().mockResolvedValue(started),
                wait,
                result: jest.fn()
            }
        })

        await expect(toolset.callMcpTaskTool('index', {}, 'generic', controller.signal)).rejects.toThrow('aborted')
        expect(dispatchCustomEvent).toHaveBeenLastCalledWith(
            ChatMessageEventTypeEnum.ON_TOOL_MESSAGE,
            expect.objectContaining({
                id: 'mcp-task:task-1',
                status: 'fail',
                data: expect.objectContaining({ status: 'cancelled' })
            })
        )
    })
})

function createToolset(consumer: object) {
    const toolset = Object.create(MCPToolset.prototype) as MCPToolset
    Reflect.set(toolset, 'toolset', { id: 'toolset-1', name: 'Remote MCP' })
    jest.spyOn(toolset, 'getMcpConsumer').mockResolvedValue(consumer as never)
    return toolset
}

function workingTask(): McpConsumerTaskStart {
    return {
        resultType: 'task',
        taskId: 'task-1',
        status: 'working',
        createdAt: '2026-08-21T01:00:00.000Z',
        lastUpdatedAt: '2026-08-21T01:00:01.000Z',
        ttlMs: 60_000,
        progress: 0.25
    }
}

function completedTask(): McpConsumerTask {
    return {
        ...workingTask(),
        resultType: 'complete',
        status: 'completed',
        progress: 1
    }
}
