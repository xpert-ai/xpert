import { Test } from '@nestjs/testing'
import { CommandBus } from '@nestjs/cqrs'
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
    const protectedRun = jest.fn()
    let source: Subject<SseMessageEvent>
    let service: GroupStreamService
    beforeEach(async () => {
        jest.useFakeTimers()
        source = new Subject()
        access.authorize.mockResolvedValue({ actor: { id: snapshot.viewerParticipantId } })
        messages.snapshot.mockResolvedValue(snapshot)
        streams.createSseStream.mockReset().mockResolvedValue({ stream: source })
        protectedRun.mockReset().mockResolvedValue(false)
        const module = await Test.createTestingModule({
            providers: [
                GroupStreamService,
                { provide: CommandBus, useValue: { execute: protectedRun } },
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
    it('emits a fresh resource request once and never replays it on a new connection', async () => {
        const events: SseMessageEvent[] = []
        const subscription = (await service.observe(groupId)).subscribe((event) => events.push(event))
        await jest.advanceTimersByTimeAsync(1)
        const request = {
            requestId: randomUUID(),
            issuedAt: Date.now(),
            clientMessageId: randomUUID(),
            participantId: snapshot.viewerParticipantId
        }
        const link = {
            resource: { kind: 'group-reference' as const, id: randomUUID() },
            projectId: randomUUID(),
            title: 'Inventory'
        }
        messages.snapshot.mockResolvedValue({
            ...snapshot,
            revision: 2,
            messages: [
                {
                    id: randomUUID(),
                    clientMessageId: request.requestId,
                    sequence: 1,
                    text: link.title,
                    createdAt: new Date().toISOString(),
                    deliveries: [],
                    communication: {
                        intent: 'message',
                        senderId: participantId,
                        recipientIds: [],
                        rootMessageId: messageId,
                        rootUserId: randomUUID(),
                        hop: 1,
                        resourceLinks: [link],
                        resourceNavigation: request
                    }
                }
            ]
        })
        await jest.advanceTimersByTimeAsync(2000)
        expect(
            events
                .filter(
                    (event) =>
                        event.data &&
                        typeof event.data === 'object' &&
                        'type' in event.data &&
                        event.data.type === 'resource_open'
                )
                .map((event) => event.data)
        ).toEqual([
            {
                type: 'resource_open',
                request: { ...link, requestId: request.requestId, clientMessageId: request.clientMessageId }
            }
        ])
        subscription.unsubscribe()
        const reconnected: SseMessageEvent[] = []
        const next = (await service.observe(groupId)).subscribe((event) => reconnected.push(event))
        await jest.advanceTimersByTimeAsync(1)
        expect(reconnected.map((event) => event.data)).toEqual([expect.objectContaining({ type: 'snapshot' })])
        next.unsubscribe()
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
        await jest.advanceTimersByTimeAsync(1)
        expect(a.map((event) => event.data)).toEqual(b.map((event) => event.data))
        expect(a).toHaveLength(2)
        expect(JSON.stringify(a)).not.toContain('private')
        expect(streams.createSseStream.mock.calls.every(([options]) => options.mode === 'join')).toBe(true)
        first.unsubscribe()
        source.next({ id: '5-0', data: { type: 'message', data: ' still running' } })
        await jest.advanceTimersByTimeAsync(1)
        expect(a).toHaveLength(2)
        expect(b).toHaveLength(3)
        second.unsubscribe()
        expect(source.observed).toBe(false)
    })
    it('holds analysis text until checked publication instead of broadcasting model deltas', async () => {
        protectedRun.mockResolvedValue(true)
        const events: SseMessageEvent[] = []
        const subscription = (await service.observe(groupId)).subscribe((event) => events.push(event))
        await jest.advanceTimersByTimeAsync(1)
        start()
        source.next({ id: '2-0', data: { type: 'message', data: 'unverified analysis result' } })
        await jest.advanceTimersByTimeAsync(1)
        expect(JSON.stringify(events)).not.toContain('unverified analysis result')
        expect(protectedRun).toHaveBeenCalled()
        subscription.unsubscribe()
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

    it('emits an acknowledgement while thinking even when revision, run state and output are unchanged', async () => {
        const message = {
            id: messageId,
            clientMessageId: messageId,
            sequence: 1,
            text: 'Question',
            createdAt: new Date().toISOString(),
            communication: {
                intent: 'request' as const,
                senderId: snapshot.viewerParticipantId,
                recipientIds: [participantId],
                rootMessageId: messageId,
                rootUserId: randomUUID(),
                hop: 0
            },
            deliveries: [{ participantId, status: 'starting' as const }]
        }
        messages.snapshot.mockResolvedValue({ ...snapshot, messages: [message] })
        const events: SseMessageEvent[] = []
        const subscription = (await service.observe(groupId)).subscribe((event) => events.push(event))
        await jest.advanceTimersByTimeAsync(1)
        expect(events).toHaveLength(1)
        messages.snapshot.mockResolvedValue({
            ...snapshot,
            messages: [{ ...message, deliveries: [{ participantId, status: 'consumed' }] }]
        })
        await jest.advanceTimersByTimeAsync(1000)
        expect(events).toHaveLength(2)
        expect(events[1].data).toMatchObject({
            type: 'snapshot',
            snapshot: {
                revision: snapshot.revision,
                runs: snapshot.runs,
                messages: [{ deliveries: [{ participantId, status: 'consumed' }] }]
            }
        })
        await jest.advanceTimersByTimeAsync(1000)
        expect(events).toHaveLength(2)
        subscription.unsubscribe()
    })
})
