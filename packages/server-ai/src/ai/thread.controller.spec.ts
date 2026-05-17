jest.mock('@xpert-ai/server-core', () => ({
    ApiKeyOrClientSecretAuthGuard: class {},
    CurrentUser: () => () => undefined,
    Public: () => () => undefined,
    TransformInterceptor: class {}
}))

jest.mock('./ai.service', () => ({
    AiService: class {}
}))

jest.mock('../copilot-checkpoint', () => ({
    CopilotCheckpointGetTupleQuery: class CopilotCheckpointGetTupleQuery {}
}))

jest.mock('../core', () => ({
    UnimplementedException: class UnimplementedException extends Error {}
}))

jest.mock('../xpert-agent-execution', () => ({
    FindAgentExecutionsQuery: class FindAgentExecutionsQuery {},
    GetThreadContextUsageQuery: class GetThreadContextUsageQuery {},
    XpertAgentExecutionOneQuery: class XpertAgentExecutionOneQuery {}
}))

jest.mock('../chat-conversation', () => ({
    CancelConversationCommand: class CancelConversationCommand {},
    GetChatConversationQuery: class GetChatConversationQuery {}
}))

import { EventEmitter } from 'events'
import { EMPTY } from 'rxjs'
import { RunCreateStreamCommand } from './commands'
import { ThreadsController } from './thread.controller'

describe('ThreadsController', () => {
    it('returns direct follow-up streams without waiting on Redis SSE replay', async () => {
        const stream = EMPTY
        const commandBus = {
            execute: jest.fn().mockResolvedValue({
                execution: { id: 'execution-1' },
                stream,
                streamTransport: 'direct'
            })
        }
        const redisSseStreamService = {
            createSseStream: jest.fn(),
            releaseConnection: jest.fn()
        }
        const controller = new ThreadsController({} as any, {} as any, commandBus as any, redisSseStreamService as any)

        const result = await controller.runStream({} as any, new EventEmitter() as any, 'thread-1', {
            assistant_id: 'xpert-1',
            input: {
                action: 'follow_up'
            }
        } as any)

        expect(result).toBe(stream)
        expect(commandBus.execute.mock.calls[0][0]).toBeInstanceOf(RunCreateStreamCommand)
        expect(redisSseStreamService.createSseStream).not.toHaveBeenCalled()
        expect(redisSseStreamService.releaseConnection).not.toHaveBeenCalled()
    })

    it('allows multiple clients to join the same run stream', async () => {
        const firstStream = EMPTY
        const secondStream = EMPTY
        const redisSseStreamService = {
            createSseStream: jest
                .fn()
                .mockResolvedValueOnce({
                    connectionId: 'connection-1',
                    stream: firstStream
                })
                .mockResolvedValueOnce({
                    connectionId: 'connection-2',
                    stream: secondStream
                }),
            releaseConnection: jest.fn().mockResolvedValue(true)
        }
        const controller = new ThreadsController({} as any, {} as any, {} as any, redisSseStreamService as any)
        const firstResponse = new EventEmitter()
        const secondResponse = new EventEmitter()

        const firstResult = await controller.joinRunStream(
            { headers: {} } as any,
            firstResponse as any,
            'thread-1',
            'run-1'
        )
        const secondResult = await controller.joinRunStream(
            { headers: {}, method: 'GET', originalUrl: '/threads/thread-1/runs/run-1/stream' } as any,
            secondResponse as any,
            'thread-1',
            'run-1',
            '1-0'
        )

        expect(firstResult).toBe(firstStream)
        expect(secondResult).toBe(secondStream)
        expect(redisSseStreamService.createSseStream).toHaveBeenCalledTimes(2)
        expect(redisSseStreamService.createSseStream).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                threadId: 'thread-1',
                runId: 'run-1',
                mode: 'join'
            })
        )
        expect(redisSseStreamService.createSseStream).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                threadId: 'thread-1',
                runId: 'run-1',
                lastEventId: '1-0',
                mode: 'join'
            })
        )

        firstResponse.emit('close')
        expect(redisSseStreamService.releaseConnection).toHaveBeenCalledWith('thread-1', 'run-1', 'connection-1')
        expect(redisSseStreamService.releaseConnection).not.toHaveBeenCalledWith('thread-1', 'run-1', 'connection-2')

        secondResponse.emit('close')
        expect(redisSseStreamService.releaseConnection).toHaveBeenCalledWith('thread-1', 'run-1', 'connection-2')
    })
})
