import type { McpConsumerConnection, McpConsumerExtensionRequest } from '../connection/mcp-consumer-connection'
import { McpConsumerTasks } from './mcp-consumer-tasks'
import type { McpConsumerTaskStart } from './task-schemas'

describe('McpConsumerTasks cancellation', () => {
    it('ends only the waiter when its signal fires; durable ownership controls cancellation', async () => {
        const requestExtension = jest.fn(
            async (_serverName: string | undefined, request: McpConsumerExtensionRequest) =>
                request.method === 'tasks/get'
                    ? {
                          resultType: 'complete',
                          taskId: 'task-1',
                          status: 'cancelled',
                          createdAt: '2026-08-21T01:00:00.000Z',
                          lastUpdatedAt: '2026-08-21T01:00:01.000Z',
                          ttlMs: 60_000
                      }
                    : { resultType: 'complete' }
        )
        const connection = { requestExtension } as unknown as McpConsumerConnection
        const tasks = new McpConsumerTasks(connection, jest.fn())
        const controller = new AbortController()
        const started: McpConsumerTaskStart = {
            resultType: 'task',
            taskId: 'task-1',
            status: 'working',
            createdAt: '2026-08-21T01:00:00.000Z',
            lastUpdatedAt: '2026-08-21T01:00:00.000Z',
            ttlMs: null
        }

        await expect(
            tasks.wait(started, {
                signal: controller.signal,
                onStatus: () => controller.abort(new Error('conversation stopped'))
            })
        ).rejects.toThrow('conversation stopped')

        expect(requestExtension.mock.calls.some(([, request]) => request.method === 'tasks/cancel')).toBe(false)
    })
})
