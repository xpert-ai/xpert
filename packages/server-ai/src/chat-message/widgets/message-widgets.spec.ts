import { Logger } from '@nestjs/common'
import type { TMessageContentWidget } from '@xpert-ai/contracts'
import {
    MessageWidgetProviderRegistry,
    type IMessageWidgetProvider,
    type MessageWidgetReference
} from '@xpert-ai/plugin-sdk'
import { lastValueFrom, of, toArray } from 'rxjs'
import type { DataSource } from 'typeorm'
import { runtimeStream } from '../../ai/runtime-presentation'
import { MESSAGE_WIDGET_RESOLVE_TIMEOUT_MS, MessageWidgets } from './message-widgets'

const messageId = '00000000-0000-4000-8000-000000000001'
const reference = (provider: string): MessageWidgetReference => ({
    threadId: 'thread',
    messageId,
    widgetId: provider,
    provider
})
const card = (id: string): TMessageContentWidget => ({
    id,
    type: 'component',
    data: { type: 'Widget', category: 'Dashboard', widgets: [] }
})

function fixture(providers: Record<string, IMessageWidgetProvider>) {
    const db = { query: jest.fn().mockResolvedValue(Object.keys(providers).map(reference)) }
    const registry = { findByName: jest.fn((name: string) => providers[name]) }
    return {
        db,
        registry,
        widgets: new MessageWidgets(db as unknown as DataSource, registry as unknown as MessageWidgetProviderRegistry)
    }
}

afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
})

it('accepts only the exact message and widget pairs bound to each provider', async () => {
    const resolve = jest.fn().mockResolvedValue([
        { messageId: 'another-message', widget: card('review') },
        { messageId, widget: card('unissued') },
        { messageId, widget: card('review') }
    ])
    const { widgets, db } = fixture({ review: { resolve } })
    expect(await widgets.resolve('thread', [messageId], false)).toEqual([{ messageId, widget: card('review') }])
    expect(db.query.mock.calls[0][1]).toEqual(['thread', [messageId]])
    expect(resolve).toHaveBeenCalledWith([reference('review')])
})

it('hides uninstalled and non-opted-in providers in restricted sessions', async () => {
    const resolve = jest.fn().mockResolvedValue([{ messageId, widget: card('review') }])
    const { widgets, registry } = fixture({ review: { resolve } })
    expect(await widgets.resolve('thread', [messageId], true)).toEqual([])
    expect(resolve).not.toHaveBeenCalled()
    registry.findByName.mockReturnValueOnce(undefined)
    expect(await widgets.resolve('thread', [messageId], false)).toEqual([])
    expect(resolve).not.toHaveBeenCalled()
})

it('isolates provider failures and clears successful resolution timers', async () => {
    jest.useFakeTimers()
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    const { widgets } = fixture({
        broken: {
            resolve: () => {
                throw new Error('provider failed')
            }
        },
        review: { resolve: async () => [{ messageId, widget: card('review') }] }
    })
    expect(await widgets.resolve('thread', [messageId], false)).toEqual([{ messageId, widget: card('review') }])
    expect(jest.getTimerCount()).toBe(0)
})

it('bounds stalled providers together and ignores their late results', async () => {
    jest.useFakeTimers()
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    let finishLate: (cards: Array<{ messageId: string; widget: TMessageContentWidget }>) => void
    const late = new Promise<Array<{ messageId: string; widget: TMessageContentWidget }>>((resolve) => {
        finishLate = resolve
    })
    const slow = { resolve: jest.fn(() => late) }
    const stalled = { resolve: jest.fn(() => new Promise<never>(() => undefined)) }
    const fast = { resolve: jest.fn(async () => [{ messageId, widget: card('fast') }]) }
    const { widgets } = fixture({ slow, stalled, fast })
    const result = widgets.resolve('thread', [messageId], false)
    await jest.advanceTimersByTimeAsync(0)
    expect(slow.resolve).toHaveBeenCalledTimes(1)
    expect(stalled.resolve).toHaveBeenCalledTimes(1)
    expect(fast.resolve).toHaveBeenCalledTimes(1)
    await jest.advanceTimersByTimeAsync(MESSAGE_WIDGET_RESOLVE_TIMEOUT_MS)
    const resolved = await result
    expect(resolved).toEqual([{ messageId, widget: card('fast') }])
    finishLate([{ messageId, widget: card('slow') }])
    await Promise.resolve()
    expect(resolved).toEqual([{ messageId, widget: card('fast') }])
    expect(jest.getTimerCount()).toBe(0)
})

it.each([
    [false, false],
    [false, true],
    [true, false],
    [true, true]
])('preserves message completion after a widget timeout (restricted=%s, Redis=%s)', async (restricted, redis) => {
    jest.useFakeTimers()
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    const { widgets } = fixture({
        slow: { visibleInRestrictedSessions: true, resolve: () => new Promise<never>(() => undefined) },
        fast: { visibleInRestrictedSessions: true, resolve: async () => [{ messageId, widget: card('fast') }] }
    })
    const end = { type: 'event', event: 'on_message_end', data: { id: messageId, role: 'ai', content: 'Done' } }
    const complete = { type: 'complete' }
    const events = of(
        { data: redis ? JSON.stringify(end) : end },
        { data: redis ? JSON.stringify(complete) : complete }
    )
    const result = lastValueFrom(
        runtimeStream(events, restricted, (ids) => widgets.resolve('thread', ids, restricted)).pipe(toArray())
    )
    await jest.advanceTimersByTimeAsync(MESSAGE_WIDGET_RESOLVE_TIMEOUT_MS)
    const emitted = await result
    expect(emitted).toHaveLength(2)
    expect(emitted[0].data).toMatchObject({
        data: { id: messageId, content: [{ type: 'text', text: 'Done' }, card('fast')] }
    })
    expect(typeof emitted[1].data === 'string' ? JSON.parse(emitted[1].data) : emitted[1].data).toEqual(complete)
})
