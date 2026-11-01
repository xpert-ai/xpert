import { of, Subject, throwError } from 'rxjs'
import { observeConversationUnread } from './conversation-unread-observer'
import type { IChatConversationUnreadSnapshot } from '@xpert-ai/contracts'

describe('adaptive unread synchronization', () => {
  let page: EventTarget & { visibilityState: DocumentVisibilityState }
  const snapshot = (version: string, active = false): IChatConversationUnreadSnapshot => ({
    version,
    items: [{ xpertId: 'assistant', unreadMessages: 0, unreadConversations: 0, hasActiveRuns: active }]
  })
  beforeEach(() => {
    jest.useFakeTimers()
    page = Object.assign(new EventTarget(), { visibilityState: 'visible' as DocumentVisibilityState })
  })
  afterEach(() => jest.useRealTimers())
  it('waits 45 seconds while idle and does not emit or clear data on 204', () => {
    const load = jest
      .fn()
      .mockReturnValueOnce(of(snapshot('one')))
      .mockReturnValue(of(null))
    const changed = jest.fn()
    const sub = observeConversationUnread(load, new Subject(), page).subscribe(changed)
    jest.advanceTimersByTime(44_999)
    expect(load).toHaveBeenCalledTimes(1)
    jest.advanceTimersByTime(1)
    expect(load).toHaveBeenLastCalledWith('one')
    expect(changed).toHaveBeenCalledTimes(1)
    sub.unsubscribe()
    jest.advanceTimersByTime(100_000)
    expect(load).toHaveBeenCalledTimes(2)
  })
  it('polls active work every 5 seconds and returns to idle after completion', () => {
    const load = jest
      .fn()
      .mockReturnValueOnce(of(snapshot('running', true)))
      .mockReturnValue(of(snapshot('done')))
    const sub = observeConversationUnread(load, new Subject(), page).subscribe()
    jest.advanceTimersByTime(5_000)
    expect(load).toHaveBeenCalledTimes(2)
    jest.advanceTimersByTime(44_999)
    expect(load).toHaveBeenCalledTimes(2)
    jest.advanceTimersByTime(1)
    expect(load).toHaveBeenCalledTimes(3)
    sub.unsubscribe()
  })
  it('suspends hidden pages, coalesces events, and follows up events received in flight', () => {
    const events = new Subject<void>()
    const pending = new Subject<IChatConversationUnreadSnapshot>()
    const load = jest
      .fn()
      .mockReturnValueOnce(pending)
      .mockReturnValue(of(snapshot('done')))
    page.visibilityState = 'hidden'
    const sub = observeConversationUnread(load, events, page).subscribe()
    events.next()
    jest.advanceTimersByTime(60_000)
    expect(load).not.toHaveBeenCalled()
    page.visibilityState = 'visible'
    page.dispatchEvent(new Event('visibilitychange'))
    events.next()
    events.next()
    jest.advanceTimersByTime(250)
    expect(load).toHaveBeenCalledTimes(1)
    pending.next(snapshot('first'))
    pending.complete()
    expect(load).toHaveBeenCalledTimes(2)
    page.visibilityState = 'hidden'
    page.dispatchEvent(new Event('visibilitychange'))
    jest.advanceTimersByTime(100_000)
    expect(load).toHaveBeenCalledTimes(2)
    sub.unsubscribe()
  })
  it('backs off unchanged active snapshots and resumes promptly on an event', () => {
    const events = new Subject<void>()
    const load = jest
      .fn()
      .mockReturnValueOnce(of(snapshot('running', true)))
      .mockReturnValue(of(null))
    const sub = observeConversationUnread(load, events, page).subscribe()
    jest.advanceTimersByTime(15_000)
    expect(load).toHaveBeenCalledTimes(4)
    jest.advanceTimersByTime(44_999)
    expect(load).toHaveBeenCalledTimes(4)
    jest.advanceTimersByTime(1)
    expect(load).toHaveBeenCalledTimes(5)
    events.next()
    jest.advanceTimersByTime(250 + 5_000)
    expect(load).toHaveBeenCalledTimes(6)
    load.mockReturnValueOnce(of(snapshot('progress', true)))
    events.next()
    jest.advanceTimersByTime(250)
    expect(load).toHaveBeenCalledTimes(7)
    jest.advanceTimersByTime(5_000)
    expect(load).toHaveBeenCalledTimes(8)
    sub.unsubscribe()
  })
  it('retains the last revision after a network error and backs off retries', () => {
    const load = jest
      .fn()
      .mockReturnValueOnce(of(snapshot('one')))
      .mockReturnValue(throwError(() => new Error('offline')))
    const changed = jest.fn()
    const sub = observeConversationUnread(load, new Subject(), page).subscribe(changed)
    jest.advanceTimersByTime(45_000 + 5_000)
    expect(load).toHaveBeenCalledTimes(3)
    expect(load).toHaveBeenLastCalledWith('one')
    expect(changed).toHaveBeenCalledTimes(1)
    sub.unsubscribe()
  })
})
