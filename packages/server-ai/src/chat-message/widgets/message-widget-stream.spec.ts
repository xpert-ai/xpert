import { RunnableLambda } from '@langchain/core/runnables'
import type { QueryBus } from '@nestjs/cqrs'
import { Logger } from '@nestjs/common'
import { appendMessageContent, ChatMessageEventTypeEnum, type IChatMessage } from '@xpert-ai/contracts'
import { MessageWidgetProviderRegistry, RequestContext } from '@xpert-ai/plugin-sdk'
import { Subscriber, lastValueFrom, of, toArray } from 'rxjs'
import type { DataSource } from 'typeorm'
import { ConversationRuntimeService } from '../../chat-conversation/conversation-runtime'
import { runtimeStream, appendMessageWidgets } from '../../ai/runtime-presentation'
import { createMapStreamEvents } from '../../xpert-agent/agent'
import { serializeRunStreamPayload } from '../../shared/stream/run-stream-payload'
import { DisplaySnapshotCapture } from '../../shared/stream/display-snapshot/display-snapshot.capture'
import {
    bindMessageWidgetEvent,
    emitMessageWidget,
    messageWidgetPlaceholder,
    MessageWidgetTextSegments
} from './message-widget-stream'

jest.mock('../../shared', () => ({
    AgentStateAnnotation: { State: {} },
    createTextChunk: jest.requireActual('../../shared/agent/stream-text').createTextChunk
}))

const messageId = '00000000-0000-4000-8000-000000000001'
const reference = { messageId, widgetId: 'review', provider: '@test/cards:review', threadId: 'thread' }
const owner = { messageId, threadId: 'thread', executionId: 'run' }
const published = { type: 'event', event: 'on_chat_event', data: { type: 'message_widget_published', reference } }
const widget = {
    ...messageWidgetPlaceholder(reference),
    data: { type: 'Widget' as const, category: 'Dashboard' as const, widgets: [{ name: 'review', messages: [] }] }
}

afterEach(() => jest.restoreAllMocks())

it('publishes the bound reference through the active runnable only after persistence succeeds', async () => {
    const query = jest.fn().mockResolvedValue([{ message_id: messageId }])
    const db = { manager: { query } }
    const provider = { resolve: jest.fn() }
    const providers = { findByName: () => provider }
    const queries = { execute: jest.fn().mockResolvedValue({ id: 'conversation' }) }
    jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
    jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
    jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org')
    jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(null)
    const runtime = new ConversationRuntimeService(
        db as unknown as DataSource,
        providers as unknown as MessageWidgetProviderRegistry,
        queries as unknown as QueryBus
    )
    const publisher = runtime.forTurn({
        ...owner,
        conversationId: 'conversation',
        userId: 'user',
        tenantId: 'tenant',
        organizationId: 'org',
        isStart: true
    })
    const events: unknown[] = []
    const run = RunnableLambda.from(async () =>
        publisher.publishWidget(provider, { provider: reference.provider, widgetId: reference.widgetId })
    )
    const config = {
        callbacks: [
            {
                handleCustomEvent: (name: string, data: unknown) => {
                    expect(query).toHaveBeenCalledTimes(1)
                    events.push({ name, data })
                }
            }
        ]
    }
    await run.invoke({}, config)
    expect(events).toEqual([{ name: ChatMessageEventTypeEnum.ON_CHAT_EVENT, data: published.data }])
    query.mockRejectedValueOnce(new Error('write failed'))
    await expect(run.invoke({}, config)).rejects.toThrow('write failed')
    expect(events).toHaveLength(1)
})

it('maps an emitted reference into an ordered placeholder bound to the current reply', async () => {
    const events: MessageEvent[] = []
    const map = createMapStreamEvents(
        new Logger('test'),
        new Subscriber<MessageEvent>({
            next: (event) => {
                events.push(event)
            },
            error: (error) => {
                throw error
            },
            complete: () => {}
        }),
        { unmutes: [] }
    )
    const run = RunnableLambda.from(async () => emitMessageWidget(reference))
    for await (const event of run.streamEvents({}, { version: 'v2' })) map(event)
    const event = events.find((event) => bindMessageWidgetEvent(event.data, owner))
    expect(bindMessageWidgetEvent(event?.data, owner)).toEqual({
        type: 'message',
        widgetReference: reference,
        data: { ...messageWidgetPlaceholder(reference), messageId, executionId: 'run' }
    })
    expect(bindMessageWidgetEvent(published, { ...owner, threadId: 'other' })).toBeNull()
    expect(bindMessageWidgetEvent(published, { ...owner, messageId: 'other' })).toBeNull()
})

it.each([false, true])(
    'keeps A → Widget → B across persistence, replay and updates (restricted=%s)',
    async (restricted) => {
        const segments = new MessageWidgetTextSegments()
        const message: IChatMessage = { id: messageId, role: 'ai', content: [] }
        const first = { type: 'text' as const, id: 'model-stream', text: 'A' }
        const delta = bindMessageWidgetEvent(published, owner)
        appendMessageContent(message, first)
        segments.insert(reference)
        appendMessageContent(message, delta.data)
        const second = segments.text({ ...first, text: 'B' }, messageId)
        if (typeof second === 'string' || second.type !== 'text') throw new Error('Expected a separate text block')
        appendMessageContent(message, second)
        segments.insert(reference)
        expect(segments.text({ ...first, text: 'C' }, messageId)).toEqual({ ...second, text: 'C' })
        const third = { ...reference, widgetId: 'another' }
        segments.insert(third)
        expect(segments.text({ ...first, text: 'D' }, messageId)).not.toEqual({ ...second, text: 'D' })
        expect(segments.text(first, 'next-reply')).toEqual(first)

        const cards = [{ messageId, widget }]
        const expected = [first, widget, second]
        expect(appendMessageWidgets(message.content, messageId, cards, restricted)).toEqual(expected)
        expect(appendMessageWidgets(expected, messageId, cards, restricted)).toEqual(expected)
        const resolve = jest.fn().mockResolvedValue(cards)
        const stream = of(
            { data: JSON.stringify({ type: 'message', data: first }) },
            { data: JSON.stringify(serializeRunStreamPayload(delta)) },
            { data: JSON.stringify({ type: 'message', data: second }) }
        )
        const result = await lastValueFrom(runtimeStream(stream, restricted, resolve).pipe(toArray()))
        const payloads = result.map((event) => (typeof event.data === 'string' ? JSON.parse(event.data) : event.data))
        expect(payloads[0].data).toEqual(first)
        expect(payloads[1]).toEqual({ type: 'message', data: { ...widget, messageId } })
        expect(payloads[2].data).toEqual(second)
        expect(JSON.stringify(payloads)).not.toContain('widgetReference')

        const capture = new DisplaySnapshotCapture()
        capture.capture({
            type: 'event',
            event: 'on_message_start',
            data: { id: messageId, role: 'ai', executionId: 'run', content: '' }
        })
        capture.capture({ type: 'message', data: first })
        capture.capture(serializeRunStreamPayload(delta))
        capture.capture({ type: 'message', data: second })
        const frozen = capture.capture({ type: 'complete' })
        expect(appendMessageWidgets(frozen.messages[0].content, messageId, cards, restricted)).toEqual(expected)
    }
)

it.each([false, true])('does not expose an unissued live reference (restricted=%s)', async (restricted) => {
    const delta = bindMessageWidgetEvent(published, owner)
    const events = await lastValueFrom(runtimeStream(of({ data: delta }), restricted, async () => []).pipe(toArray()))
    expect(events).toEqual([])
})
