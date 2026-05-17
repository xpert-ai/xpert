import { AgentChatRealtimeService } from './agent-chat-realtime.service'
import { StopHandoffMessageCommand } from './commands'

class FakeRedisSubscriber {
    isOpen = true
    channel?: string
    handler?: (message: string) => void

    async connect() {
        return undefined
    }

    async subscribe(channel: string, handler: (message: string) => void) {
        this.channel = channel
        this.handler = handler
    }

    async quit() {
        this.isOpen = false
    }
}

class FakeRedis {
    readonly subscribers: FakeRedisSubscriber[] = []
    readonly published: Array<{ channel: string; message: string }> = []

    duplicate() {
        const subscriber = new FakeRedisSubscriber()
        this.subscribers.push(subscriber)
        return subscriber
    }

    async publish(channel: string, message: string) {
        this.published.push({ channel, message })
        this.subscribers
            .filter((subscriber) => subscriber.channel === channel)
            .forEach((subscriber) => subscriber.handler?.(message))
        return 1
    }
}

describe('AgentChatRealtimeService', () => {
    it('subscribes before enqueueing and forwards stream payloads published by another instance', async () => {
        const redis = new FakeRedis()
        const commandBus = { execute: jest.fn() }
        const service = new AgentChatRealtimeService(redis as any, commandBus as any)
        const workerInstance = new AgentChatRealtimeService(redis as any, { execute: jest.fn() } as any)
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
        const commandBus = { execute: jest.fn() }
        const service = new AgentChatRealtimeService(redis as any, commandBus as any)
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
        const commandBus = { execute: jest.fn().mockResolvedValue(null) }
        const service = new AgentChatRealtimeService(redis as any, commandBus as any)
        let markStarted = () => undefined
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
})
