import { TestBed } from '@angular/core/testing'
import { fetchEventSource } from '@microsoft/fetch-event-source'
import { RequestScopeLevel, RUNTIME_STREAM_INTERRUPTED_EVENT } from '@xpert-ai/contracts'
import { AuthStrategy } from '../auth'
import { Store } from './store.service'
import { injectFetchEventSource, RuntimeStreamInterruptedError } from './fetch-event-source'

jest.mock('../auth', () => ({ AuthStrategy: class {} }))
jest.mock('./store.service', () => ({ Store: class {} }))
jest.mock('../providers', () => ({ injectLanguage: () => () => 'en' }))
jest.mock('@microsoft/fetch-event-source', () => ({
  EventStreamContentType: 'text/event-stream',
  fetchEventSource: jest.fn()
}))

describe('SSE runtime interruption', () => {
  const fetch = jest.mocked(fetchEventSource)

  beforeEach(() => {
    fetch.mockReset().mockResolvedValue(undefined)
    TestBed.configureTestingModule({
      providers: [
        { provide: Store, useValue: { activeScope: { level: RequestScopeLevel.TENANT }, token: 'test-token' } },
        { provide: AuthStrategy, useValue: { refreshToken: jest.fn() } }
      ]
    })
  })

  function subscribe() {
    const request = TestBed.runInInjectionContext(() => injectFetchEventSource())
    const next = jest.fn()
    const error = jest.fn()
    const complete = jest.fn()
    const subscription = request('/api/xpert/demo/chat-app', '{}').subscribe({ next, error, complete })
    const options = fetch.mock.calls[0][1]
    if (!options) throw new Error('Missing SSE transport options')
    return { next, error, complete, subscription, options }
  }

  it('reports restart interruption as an error, never normal completion, and never replays the POST', () => {
    const f = subscribe()
    f.options.onmessage?.({
      id: '',
      event: RUNTIME_STREAM_INTERRUPTED_EVENT,
      data: JSON.stringify({ code: 'RUNTIME_RESTARTING', message: '服务正在重启，实时回复已中断。' })
    })
    // The server sends EOF after its interruption event.
    f.options.onclose?.()
    expect(f.error).toHaveBeenCalledTimes(1)
    expect(f.error).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'RUNTIME_RESTARTING',
        message: '服务正在重启，实时回复已中断。'
      })
    )
    expect(f.error.mock.calls[0][0]).toBeInstanceOf(RuntimeStreamInterruptedError)
    expect(f.next).not.toHaveBeenCalled()
    expect(f.complete).not.toHaveBeenCalled()
    expect(f.subscription.closed).toBe(true)
    expect(f.options.signal?.aborted).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('preserves ordinary messages, legacy error events and successful completion', () => {
    const f = subscribe()
    const message = { id: '1', event: 'message', data: '{"text":"hello"}' }
    const legacyError = { id: '2', event: 'error', data: 'Model error' }
    f.options.onmessage?.(message)
    f.options.onmessage?.(legacyError)
    f.options.onclose?.()
    expect(f.next.mock.calls).toEqual([[message], [legacyError]])
    expect(f.complete).toHaveBeenCalledTimes(1)
    expect(f.error).not.toHaveBeenCalled()
  })

  it('rejects a malformed interruption rather than presenting a successful reply', async () => {
    fetch.mockImplementation(async (_url, options) => {
      options?.onmessage?.({ id: '', event: RUNTIME_STREAM_INTERRUPTED_EVENT, data: '{"message":42}' })
    })
    const f = subscribe()
    await Promise.resolve()
    expect(f.error).toHaveBeenCalledWith(expect.any(Error))
    expect(f.complete).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
