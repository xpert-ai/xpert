import { ChatMessageEventTypeEnum, ChatMessageTypeEnum } from '@xpert-ai/contracts'
import { lastValueFrom, of, throwError } from 'rxjs'
import { RedisSseStreamService } from './redis-sse.service'

describe('RedisSseStreamService', () => {
    it('stores lock owner metadata when acquiring a stream lock', async () => {
        const redis = createRedisMock()
        redis.set.mockResolvedValueOnce('OK').mockResolvedValueOnce('OK')

        const service = new RedisSseStreamService(redis as any)
        const result = await service.createSseStream({
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

        expect(result.lockId).toBeTruthy()
        expect(redis.set).toHaveBeenNthCalledWith(1, 'ai:sse:lock:thread:thread-1:run:run-1', expect.any(String), {
            PX: 30000,
            NX: true
        })
        expect(redis.set).toHaveBeenNthCalledWith(
            2,
            'ai:sse:lockmeta:thread:thread-1:run:run-1',
            expect.stringContaining('"userAgent":"chatkit"'),
            { PX: 30000 }
        )
    })

    it('returns current lock owner metadata when the stream is already locked', async () => {
        const redis = createRedisMock()
        redis.set.mockResolvedValueOnce(null)
        redis.get.mockResolvedValueOnce('lock-1').mockResolvedValueOnce(
            JSON.stringify({
                lockId: 'lock-1',
                connectedAt: '2026-03-07T00:00:00.000Z',
                mode: 'join',
                requestId: 'req-existing',
                userId: 'user-existing',
                userAgent: 'existing-client'
            })
        )
        redis.pTTL.mockResolvedValueOnce(12000)

        const service = new RedisSseStreamService(redis as any)
        const result = await service.createSseStream({
            threadId: 'thread-1',
            runId: 'run-1',
            mode: 'join',
            owner: {
                mode: 'join',
                requestId: 'req-new'
            }
        })

        expect(result.lockId).toBeNull()
        expect(result.lock).toEqual({
            lockId: 'lock-1',
            ttlMs: 12000,
            owner: expect.objectContaining({
                requestId: 'req-existing',
                userId: 'user-existing',
                userAgent: 'existing-client'
            })
        })
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
