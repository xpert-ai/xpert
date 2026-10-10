import { Test } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import { Subject } from 'rxjs'
import { randomUUID } from 'node:crypto'
import { ForbiddenException } from '@nestjs/common'
import type { ChatGroupSnapshot } from '@xpert-ai/contracts'
import { GroupStreamService } from './group-stream.service'
import { GroupAccessService } from './group-access.service'
import { GroupMessagesService } from './group-messages.service'
import { RedisSseStreamService, SseMessageEvent } from '../shared/stream/redis-sse.service'

describe('group observers', () => {
    const groupId = randomUUID(),
        participantId = randomUUID(),
        runId = randomUUID(),
        messageId = randomUUID()
    const snapshot: ChatGroupSnapshot = {
        id: groupId,
        threadId: randomUUID(),
        title: 'D',
        viewerParticipantId: randomUUID(),
        xpertId: participantId,
        members: [],
        messages: [],
        hasMore: false,
        revision: 1,
        runs: [{ participantId, runId, status: 'busy' }]
    }
    const access = { authorize: jest.fn() }
    const messages = { snapshot: jest.fn() }
    const streams = { createSseStream: jest.fn() }
    let source: Subject<SseMessageEvent>
    let service: GroupStreamService
    beforeEach(async () => {
        jest.useFakeTimers()
        source = new Subject()
        access.authorize.mockResolvedValue({ actor: { id: snapshot.viewerParticipantId } })
        messages.snapshot.mockResolvedValue(snapshot)
        streams.createSseStream.mockReset().mockResolvedValue({ stream: source })
        const module = await Test.createTestingModule({
            providers: [
                GroupStreamService,
                { provide: GroupAccessService, useValue: access },
                { provide: GroupMessagesService, useValue: messages },
                { provide: RedisSseStreamService, useValue: streams },
                {
                    provide: DataSource,
                    useValue: {
                        getRepository: () => ({
                            findOneBy: async () => ({ id: participantId, runtimeThreadId: randomUUID() })
                        })
                    }
                }
            ]
        }).compile()
        service = module.get(GroupStreamService)
    })
    afterEach(() => {
        source.complete()
        jest.useRealTimers()
    })
    const start = () =>
        source.next({
            id: '1-0',
            data: { type: 'event', event: 'on_message_start', data: { id: messageId, role: 'ai' } }
        })
    it('fans out public text, suppresses private events, and disconnects readers independently', async () => {
        const a: SseMessageEvent[] = [],
            b: SseMessageEvent[] = []
        const first = (await service.observe(groupId)).subscribe((event) => a.push(event))
        const second = (await service.observe(groupId)).subscribe((event) => b.push(event))
        await jest.advanceTimersByTimeAsync(1)
        start()
        source.next({ id: '2-0', data: { type: 'event', event: 'on_tool_start', data: { private: 'secret' } } })
        source.next({ id: '3-0', data: { type: 'message', data: { type: 'reasoning', text: 'private' } } })
        source.next({ id: '4-0', data: { type: 'message', data: 'visible' } })
        expect(a.map((event) => event.data)).toEqual(b.map((event) => event.data))
        expect(a).toHaveLength(2)
        expect(JSON.stringify(a)).not.toContain('private')
        expect(streams.createSseStream.mock.calls.every(([options]) => options.mode === 'join')).toBe(true)
        first.unsubscribe()
        source.next({ id: '5-0', data: { type: 'message', data: ' still running' } })
        expect(a).toHaveLength(2)
        expect(b).toHaveLength(3)
        second.unsubscribe()
        expect(source.observed).toBe(false)
    })
    it('restarts from the snapshot for a tampered cursor and ends on membership/session revocation', async () => {
        const events: SseMessageEvent[] = [],
            errors: unknown[] = []
        const subscription = (await service.observe(groupId, 'tampered')).subscribe({
            next: (event) => events.push(event),
            error: (error) => errors.push(error)
        })
        await jest.advanceTimersByTimeAsync(1)
        expect(events[0].data).toEqual({ type: 'resync' })
        messages.snapshot.mockRejectedValueOnce(new ForbiddenException())
        await jest.advanceTimersByTimeAsync(1000)
        expect(errors).toHaveLength(1)
        expect(subscription.closed).toBe(true)
        expect(source.observed).toBe(false)
    })
    it('rejects a valid cursor bound to a different viewer', async () => {
        const events: SseMessageEvent[] = []
        const first = (await service.observe(groupId)).subscribe((event) => events.push(event))
        await jest.advanceTimersByTimeAsync(1)
        first.unsubscribe()
        access.authorize.mockResolvedValue({ actor: { id: randomUUID() } })
        const next: SseMessageEvent[] = []
        const second = (await service.observe(groupId, events[0].id)).subscribe((event) => next.push(event))
        await jest.advanceTimersByTimeAsync(1)
        expect(next[0].data).toEqual({ type: 'resync' })
        second.unsubscribe()
    })
})
