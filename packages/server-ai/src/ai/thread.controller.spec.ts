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
            releaseLock: jest.fn()
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
        expect(redisSseStreamService.releaseLock).not.toHaveBeenCalled()
    })
})
