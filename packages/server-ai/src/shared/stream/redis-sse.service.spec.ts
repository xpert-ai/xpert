import { ChatMessageEventTypeEnum, ChatMessageTypeEnum } from '@xpert-ai/contracts'
import { lastValueFrom, of, throwError, toArray } from 'rxjs'
import { RedisSseStreamService } from './redis-sse.service'

describe('RedisSseStreamService', () => {
    it('stores per-connection owner metadata when creating stream readers', async () => {
        const redis = createRedisMock()
        redis.set.mockResolvedValue('OK')
        redis.sendCommand.mockResolvedValue(1)

        const service = new RedisSseStreamService(redis as any)
        const first = await service.createSseStream({
            threadId: 'thread-1',
            runId: 'run-1',
            mode: 'join',
            owner: {
                mode: 'join',
                requestId: 'req-1',
                userId: 'user-1',
                userAgent: 'chatkit'
            }
        })
        const second = await service.createSseStream({
            threadId: 'thread-1',
            runId: 'run-1',
            mode: 'join',
            owner: {
                mode: 'join',
                requestId: 'req-2',
                userId: 'user-2',
                userAgent: 'chatkit'
            }
        })

        expect(first.connectionId).toBeTruthy()
        expect(second.connectionId).toBeTruthy()
        expect(first.connectionId).not.toBe(second.connectionId)
        expect(redis.set).toHaveBeenCalledWith(
            `ai:sse:connection:thread:thread-1:run:run-1:${first.connectionId}`,
            expect.stringContaining('"userAgent":"chatkit"'),
            { PX: 30000 }
        )
        expect(redis.set).toHaveBeenCalledWith(
            `ai:sse:connection:thread:thread-1:run:run-1:${second.connectionId}`,
            expect.stringContaining('"requestId":"req-2"'),
            { PX: 30000 }
        )
        expect(redis.sendCommand).toHaveBeenCalledWith([
            'SADD',
            'ai:sse:connections:thread:thread-1:run:run-1',
            first.connectionId
        ])
        expect(redis.sendCommand).toHaveBeenCalledWith([
            'SADD',
            'ai:sse:connections:thread:thread-1:run:run-1',
            second.connectionId
        ])
    })

    it('allows two readers on the same stream to replay the same run events independently', async () => {
        const redis = createRedisMock()
        redis.set.mockResolvedValue('OK')
        redis.sendCommand.mockImplementation(async (args: string[]) => {
            if (args[0] === 'SADD') {
                return 1
            }
            if (args[0] === 'XRANGE') {
                return [
                    [
                        '2-0',
                        [
                            'data',
                            JSON.stringify({
                                type: ChatMessageTypeEnum.MESSAGE,
                                data: 'hello'
                            })
                        ]
                    ],
                    [
                        '3-0',
                        [
                            'data',
                            JSON.stringify({
                                type: 'complete'
                            })
                        ]
                    ]
                ]
            }
            return null
        })
        redis.eval.mockResolvedValue(1)

        const service = new RedisSseStreamService(redis as any)
        const first = await service.createSseStream({
            threadId: 'thread-1',
            runId: 'run-1',
            mode: 'join',
            owner: {
                mode: 'join',
                requestId: 'req-new'
            }
        })
        const second = await service.createSseStream({
            threadId: 'thread-1',
            runId: 'run-1',
            lastEventId: '1-0',
            mode: 'join',
            owner: {
                mode: 'join',
                requestId: 'req-newer'
            }
        })

        const [firstEvents, secondEvents] = await Promise.all([
            lastValueFrom(first.stream.pipe(toArray())),
            lastValueFrom(second.stream.pipe(toArray()))
        ])

        expect(first.connectionId).not.toBe(second.connectionId)
        expect(firstEvents.map((event) => event.id)).toEqual(['2-0', '3-0'])
        expect(secondEvents.map((event) => event.id)).toEqual(['2-0', '3-0'])
        expect(firstEvents.at(-1)?.type).toBe('complete')
        expect(secondEvents.at(-1)?.type).toBe('complete')
        expect(redis.eval).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                keys: [
                    `ai:sse:connection:thread:thread-1:run:run-1:${first.connectionId}`,
                    'ai:sse:connections:thread:thread-1:run:run-1'
                ],
                arguments: [first.connectionId]
            })
        )
        expect(redis.eval).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                keys: [
                    `ai:sse:connection:thread:thread-1:run:run-1:${second.connectionId}`,
                    'ai:sse:connections:thread:thread-1:run:run-1'
                ],
                arguments: [second.connectionId]
            })
        )
    })

    it('persists chat stream events and a complete marker when enabled', async () => {
        const service = new RedisSseStreamService(createRedisMock() as any)
        const appendEvent = jest.spyOn(service, 'appendEvent').mockResolvedValue('1-0')
        const appendCompleteEvent = jest.spyOn(service, 'appendCompleteEvent').mockResolvedValue('2-0')
        const event = {
            data: {
                type: ChatMessageTypeEnum.MESSAGE,
                data: 'hello'
            }
        } as MessageEvent

        await lastValueFrom(
            service.wrapChatStream(of(event), {
                target: {
                    transport: 'redis-stream',
                    threadId: ' ',
                    runId: null
                },
                threadId: 'thread-1',
                runId: 'run-1'
            })
        )

        expect(appendEvent).toHaveBeenCalledWith('thread-1', 'run-1', event.data)
        expect(appendCompleteEvent).toHaveBeenCalledWith('thread-1', 'run-1')
    })

    it('persists a chat error event and complete marker when the stream errors', async () => {
        const service = new RedisSseStreamService(createRedisMock() as any)
        const appendEvent = jest.spyOn(service, 'appendEvent').mockResolvedValue('1-0')
        const appendCompleteEvent = jest.spyOn(service, 'appendCompleteEvent').mockResolvedValue('2-0')

        await expect(
            lastValueFrom(
                service.wrapChatStream(
                    throwError(() => new Error('boom')),
                    {
                        target: {
                            transport: 'redis-stream',
                            threadId: 'thread-1',
                            runId: 'run-1'
                        }
                    }
                )
            )
        ).rejects.toThrow('boom')

        expect(appendEvent).toHaveBeenCalledWith(
            'thread-1',
            'run-1',
            expect.objectContaining({
                type: ChatMessageTypeEnum.EVENT,
                event: ChatMessageEventTypeEnum.ON_ERROR,
                data: {
                    error: 'boom'
                }
            })
        )
        expect(appendCompleteEvent).toHaveBeenCalledWith('thread-1', 'run-1')
    })

    it('leaves chat streams untouched when persistence is not enabled', async () => {
        const service = new RedisSseStreamService(createRedisMock() as any)
        const appendEvent = jest.spyOn(service, 'appendEvent')
        const appendCompleteEvent = jest.spyOn(service, 'appendCompleteEvent')
        const stream = of({ data: 'hello' } as MessageEvent)

        expect(service.wrapChatStream(stream)).toBe(stream)
        await lastValueFrom(service.wrapChatStream(stream))

        expect(appendEvent).not.toHaveBeenCalled()
        expect(appendCompleteEvent).not.toHaveBeenCalled()
    })
})

function createRedisMock() {
    return {
        set: jest.fn(),
        get: jest.fn(),
        pTTL: jest.fn(),
        pExpire: jest.fn(),
        eval: jest.fn(),
        sendCommand: jest.fn()
    }
}
