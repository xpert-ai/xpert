import { RemoteEditorClose } from './remote-editor-close'

describe('RemoteEditorClose', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('accepts only the matching request and explicit true acknowledgement', async () => {
    const send = jest.fn(),
      close = new RemoteEditorClose(send)
    const pending = close.prepare('file-1')
    const request = send.mock.calls[0][0]
    expect(request).toMatchObject({ kind: 'prepareClose', resourceId: 'file-1' })
    close.acknowledge('other-request', true)
    expect(jest.getTimerCount()).toBe(1)
    close.acknowledge(request.requestId, true)
    await expect(pending).resolves.toBe(true)
    expect(jest.getTimerCount()).toBe(0)
    const denied = close.prepare('file-2')
    close.acknowledge(send.mock.calls[1][0].requestId, 'true')
    await expect(denied).resolves.toBe(false)
  })

  it('fails closed on timeout, context cancellation and delivery failure', async () => {
    const send = jest.fn(),
      close = new RemoteEditorClose(send)
    const timed = close.prepare('file')
    jest.advanceTimersByTime(10000)
    await expect(timed).resolves.toBe(false)
    const first = close.prepare('file-1'),
      second = close.prepare('file-2')
    close.cancel()
    await expect(first).resolves.toBe(false)
    await expect(second).resolves.toBe(false)
    expect(jest.getTimerCount()).toBe(0)
    const broken = new RemoteEditorClose(() => {
      throw new Error('frame unavailable')
    })
    await expect(broken.prepare('file')).resolves.toBe(false)
    expect(jest.getTimerCount()).toBe(0)
  })
})
