import { coordinateNotificationStream, NotificationStreamEnvironment } from './notification-stream-coordinator'

function harness() {
  const request = jest.fn()
  const channels: Array<ReturnType<NotificationStreamEnvironment['channel']>> = []
  const environment: NotificationStreamEnvironment = {
    locks: { request },
    channel: () => {
      const channel = { onmessage: null, close: jest.fn(), postMessage: jest.fn() }
      channels.push(channel)
      return channel
    }
  }
  request.mockResolvedValue(undefined)
  const grant = (index: number) => request.mock.calls[index][2]() as Promise<void>
  return { environment, request, channels, grant }
}

describe('Notification stream ownership', () => {
  it('opens only after acquiring the scope lock and relays invalidations without data', async () => {
    const { environment, request, channels, grant } = harness()
    const stop = jest.fn()
    const start = jest.fn((_publish: () => void) => stop)
    const follower = jest.fn()
    const owner = coordinateNotificationStream('scope-a', start, jest.fn(), environment)
    const peer = coordinateNotificationStream('scope-a', jest.fn(), follower, environment)
    expect(start).not.toHaveBeenCalled()
    expect(request.mock.calls[0][0]).toBe(request.mock.calls[1][0])
    const held = grant(0)
    expect(start).toHaveBeenCalledTimes(1)
    const publish = start.mock.calls[0][0]
    publish()
    expect(channels[0].postMessage).toHaveBeenCalledWith('invalidate')
    channels[1].onmessage(new MessageEvent('message', { data: { type: 'invalid' } }))
    expect(follower).not.toHaveBeenCalled()
    channels[1].onmessage(new MessageEvent('message', { data: 'invalidate' }))
    expect(follower).toHaveBeenCalledTimes(1)
    owner()
    await held
    expect(stop).toHaveBeenCalledTimes(1)
    expect(channels[0].close).toHaveBeenCalledTimes(1)
    publish()
    expect(channels[0].postMessage).toHaveBeenCalledTimes(1)
    peer()
  })

  it('isolates scopes and cancels queued ownership when stopped', async () => {
    const { environment, request, grant } = harness()
    const start = jest.fn(() => jest.fn())
    const first = coordinateNotificationStream('scope-a', start, jest.fn(), environment)
    const second = coordinateNotificationStream('scope-b', start, jest.fn(), environment)
    expect(request.mock.calls[0][0]).not.toBe(request.mock.calls[1][0])
    first()
    expect(request.mock.calls[0][1].signal.aborted).toBe(true)
    await grant(0)
    expect(start).not.toHaveBeenCalled()
    second()
  })

  it('falls back to polling if coordination is unavailable or denied', async () => {
    const { environment, request, channels } = harness()
    const start = jest.fn()
    coordinateNotificationStream('scope', start, jest.fn(), { ...environment, locks: null })()
    request.mockRejectedValue(new Error('Denied'))
    const stop = coordinateNotificationStream('scope', start, jest.fn(), environment)
    await Promise.resolve()
    expect(start).not.toHaveBeenCalled()
    expect(channels[0].close).toHaveBeenCalledTimes(1)
    stop()
    expect(channels[0].close).toHaveBeenCalledTimes(1)
  })
})
