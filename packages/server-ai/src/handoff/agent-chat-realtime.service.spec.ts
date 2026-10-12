import { RUNTIME_STREAM_INTERRUPTED_EVENT } from '@xpert-ai/contracts'
import i18next from 'i18next'
import { Subscription } from 'rxjs'
import { CommandBus } from '@nestjs/cqrs'
import { createClient, RedisClientType, RedisDefaultModules } from 'redis'

import { AgentChatRealtimeService } from './agent-chat-realtime.service'
import { StopHandoffMessageCommand } from './commands'

jest.mock('@xpert-ai/server-core', () => ({
    REDIS_CLIENT: 'REDIS_CLIENT',
    ...jest.requireActual('../../../server/src/runtime-control/shutdown-step')
}))

class FakeRedis {
    readonly subscribers: Array<{ client: RedisClientType; channel?: string; handler?: (message: string) => void }> = []
    readonly client = createClient<RedisDefaultModules, Record<string, never>, Record<string, never>>()

    constructor() {
        jest.spyOn(this.client, 'duplicate').mockImplementation(() => {
            const client = createClient<RedisDefaultModules, Record<string, never>, Record<string, never>>()
            const subscription: (typeof this.subscribers)[number] = { client }
            jest.spyOn(client, 'connect').mockResolvedValue(client)
            jest.spyOn(client, 'subscribe').mockImplementation(async (channel, handler) => {
                subscription.channel = String(channel)
                subscription.handler = (message) => handler(message, String(channel))
            })
            jest.spyOn(client, 'isOpen', 'get').mockReturnValue(true)
            jest.spyOn(client, 'disconnect').mockResolvedValue(undefined)
            this.subscribers.push(subscription)
            return client
        })
        jest.spyOn(this.client, 'publish').mockImplementation(async (...args) => {
            const [channel, message] = args.length === 2 ? args : [args[1], args[2]]
            this.subscribers
                .filter((subscriber) => subscriber.channel === channel)
                .forEach((subscriber) => subscriber.handler?.(String(message)))
            return 1
        })
    }
}

function createCommandBus() {
    const commandBus: CommandBus = Object.create(CommandBus.prototype)
    jest.spyOn(commandBus, 'execute').mockResolvedValue(null)
    return commandBus
}

describe('AgentChatRealtimeService', () => {
    beforeAll(async () => {
        await i18next.init({ lng: 'en', resources: {} })
    })
    it('subscribes before enqueueing and forwards stream payloads published by another instance', async () => {
        const redis = new FakeRedis()
        const commandBus = createCommandBus()
        const service = new AgentChatRealtimeService(redis.client, commandBus)
        const workerInstance = new AgentChatRealtimeService(redis.client, createCommandBus())
        const events: MessageEvent[] = []

        const completed = new Promise<void>((resolve) => {
            service
                .createStream('run-1', async () => {
                    expect(redis.subscribers[0]?.channel).toBe(service.getChannel('run-1'))
                    await workerInstance.publish('run-1', {
                        kind: 'stream',
                        sourceMessageId: 'run-1',
                        sequence: 1,
                        event: { data: { type: 'message', data: 'hello' } } as MessageEvent
                    })
                    await workerInstance.publish('run-1', {
                        kind: 'complete',
                        sourceMessageId: 'run-1',
                        sequence: 2
                    })
                })
                .subscribe({
                    next: (event) => events.push(event),
                    complete: resolve
                })
        })

        await completed

        expect(events).toEqual([{ data: { type: 'message', data: 'hello' } }])
        expect(commandBus.execute).not.toHaveBeenCalled()
    })

    it('emits error event payloads and completes', async () => {
        const redis = new FakeRedis()
        const commandBus = createCommandBus()
        const service = new AgentChatRealtimeService(redis.client, commandBus)
        const events: MessageEvent[] = []

        const completed = new Promise<void>((resolve) => {
            service
                .createStream('run-error', async () => {
                    await service.publish('run-error', {
                        kind: 'error',
                        sourceMessageId: 'run-error',
                        sequence: 1,
                        error: 'boom'
                    })
                })
                .subscribe({
                    next: (event) => events.push(event),
                    complete: resolve
                })
        })

        await completed

        expect(events).toEqual([{ type: 'error', data: 'boom' }])
    })

    it('cancels the handoff message when unsubscribed before completion', async () => {
        const redis = new FakeRedis()
        const commandBus = createCommandBus()
        const service = new AgentChatRealtimeService(redis.client, commandBus)
        let markStarted: () => void = () => undefined
        const started = new Promise<void>((resolve) => {
            markStarted = resolve
        })

        const subscription = service
            .createStream('run-cancel', async () => {
                markStarted()
            })
            .subscribe()

        await started
        subscription.unsubscribe()
        await Promise.resolve()

        expect(commandBus.execute).toHaveBeenCalledWith(
            new StopHandoffMessageCommand({
                messageIds: ['run-cancel'],
                reason: 'SSE client disconnected'
            })
        )
    })
    it('signals interruption before ending SSE without cancelling the background job', async () => {
        const redis = new FakeRedis()
        const commandBus = createCommandBus()
        const service = new AgentChatRealtimeService(redis.client, commandBus)
        let started: () => void
        const ready = new Promise<void>((resolve) => {
            started = resolve
        })
        const complete = jest.fn()
        const next = jest.fn()
        service
            .createStream('shutdown-run', async () => {
                started()
            })
            .subscribe({ next, complete })
        await ready
        await service.onModuleDestroy()
        expect(complete).toHaveBeenCalledTimes(1)
        expect(next).toHaveBeenCalledWith({
            type: RUNTIME_STREAM_INTERRUPTED_EVENT,
            data: { code: 'RUNTIME_RESTARTING', message: expect.stringContaining('restarting') }
        })
        expect(next.mock.invocationCallOrder[0]).toBeLessThan(complete.mock.invocationCallOrder[0])
        expect(redis.subscribers[0].client.disconnect).toHaveBeenCalledTimes(1)
        expect(commandBus.execute).not.toHaveBeenCalled()
        const lateStart = jest.fn()
        service.createStream('late-run', lateStart).subscribe({ next, complete })
        expect(lateStart).not.toHaveBeenCalled()
        expect(complete).toHaveBeenCalledTimes(2)
        expect(next).toHaveBeenCalledTimes(2)
    })

    it('does not cancel the job when the client disconnects immediately on the interruption event', async () => {
        const redis = new FakeRedis()
        const commandBus = createCommandBus()
        const service = new AgentChatRealtimeService(redis.client, commandBus)
        let started: () => void
        const ready = new Promise<void>((resolve) => {
            started = resolve
        })
        let subscription: Subscription
        subscription = service
            .createStream('disconnect-on-interruption', async () => {
                started()
            })
            .subscribe({
                next: (event) => {
                    if (event.type === RUNTIME_STREAM_INTERRUPTED_EVENT) subscription.unsubscribe()
                }
            })
        await ready
        await service.onModuleDestroy()
        expect(subscription.closed).toBe(true)
        expect(commandBus.execute).not.toHaveBeenCalled()
        expect(redis.subscribers[0].client.disconnect).toHaveBeenCalledTimes(1)
    })

    it('does not enqueue work when shutdown races with Redis connection setup', async () => {
        const redis = new FakeRedis()
        const subscriber = createClient<RedisDefaultModules, Record<string, never>, Record<string, never>>()
        let connected: (client: typeof subscriber) => void
        jest.spyOn(subscriber, 'connect').mockReturnValue(
            new Promise((resolve) => {
                connected = resolve
            })
        )
        jest.spyOn(subscriber, 'isOpen', 'get').mockReturnValue(true)
        jest.spyOn(subscriber, 'disconnect').mockResolvedValue(undefined)
        jest.spyOn(redis.client, 'duplicate').mockReturnValue(subscriber)
        const start = jest.fn()
        const complete = jest.fn()
        const service = new AgentChatRealtimeService(redis.client, createCommandBus())
        service.createStream('connecting', start).subscribe({ complete })
        await service.onModuleDestroy()
        connected(subscriber)
        await Promise.resolve()
        expect(complete).toHaveBeenCalledTimes(1)
        expect(subscriber.disconnect).toHaveBeenCalledTimes(1)
        expect(start).not.toHaveBeenCalled()
    })
})
