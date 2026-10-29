import { UPDATE_SESSION_KEYS, WebRelease, WebUpdateController } from './web-update-controller'

describe('Web build update state', () => {
  const current: WebRelease = { buildId: 'A', version: '3.26.2' }
  let storage: Storage
  let fetchRelease: jest.Mock<Promise<unknown>, [AbortSignal]>
  let controller: WebUpdateController
  beforeEach(() => {
    sessionStorage.clear()
    storage = sessionStorage
    fetchRelease = jest.fn(async () => current)
    controller = new WebUpdateController(current, fetchRelease, storage, jest.fn())
  })

  it('compares builds, including same display version and rollback', async () => {
    await controller.check()
    expect(controller.state.status).toBe('current')
    fetchRelease.mockResolvedValue({ ...current, buildId: 'B' })
    await controller.check()
    expect(controller.state.status).toBe('available')
    const newer = new WebUpdateController({ ...current, buildId: 'B' }, fetchRelease, storage, jest.fn())
    fetchRelease.mockResolvedValue(current)
    await newer.check()
    expect(newer.state.status).toBe('available')
  })

  it('coalesces concurrent startup/foreground checks', async () => {
    let resolve: (value: unknown) => void = () => undefined
    fetchRelease.mockReturnValue(
      new Promise((done) => {
        resolve = done
      })
    )
    const first = controller.check()
    expect(controller.check()).toBe(first)
    expect(fetchRelease).toHaveBeenCalledTimes(1)
    resolve(current)
    await first
  })

  it('dismisses only the notified build across page reloads', async () => {
    fetchRelease.mockResolvedValue({ ...current, buildId: 'B' })
    await controller.check()
    controller.dismiss()
    const reopened = new WebUpdateController(current, fetchRelease, storage, jest.fn())
    await reopened.check()
    expect(reopened.state.dismissed).toBe(true)
    expect(reopened.state.status).toBe('available')
    fetchRelease.mockResolvedValue({ ...current, buildId: 'C' })
    await reopened.check()
    expect(reopened.state.dismissed).toBe(false)
  })

  it('records update intent and reports stale reload without retrying navigation', async () => {
    fetchRelease.mockResolvedValue({ ...current, buildId: 'B' })
    await controller.check()
    expect(controller.expectUpdate()).toBe(true)
    const stale = new WebUpdateController(current, fetchRelease, storage, jest.fn())
    await stale.check()
    expect(stale.state.incomplete).toBe(true)
    const refreshed = new WebUpdateController({ ...current, buildId: 'B' }, fetchRelease, storage, jest.fn())
    await refreshed.check()
    expect(refreshed.state.status).toBe('current')
    expect(refreshed.state.incomplete).toBe(false)
    expect(storage.getItem(UPDATE_SESSION_KEYS.expected)).toBeNull()
  })

  it('does not dismiss a newer release when an older notice finishes closing', async () => {
    fetchRelease.mockResolvedValue({ ...current, buildId: 'C' })
    await controller.check()
    controller.dismiss('B')
    expect(controller.state.dismissed).toBe(false)
  })

  it('accepts the latest release when deployment advances during reload', async () => {
    storage.setItem(UPDATE_SESSION_KEYS.expected, 'B')
    fetchRelease.mockResolvedValue({ ...current, buildId: 'C' })
    const refreshed = new WebUpdateController({ ...current, buildId: 'C' }, fetchRelease, storage, jest.fn())
    await refreshed.check()
    expect(refreshed.state.status).toBe('current')
    expect(refreshed.state.incomplete).toBe(false)
  })

  it.each([null, {}, '<html>', { buildId: 'B' }, { buildId: '', version: '1' }])(
    'does not accept invalid metadata %p',
    async (value) => {
      fetchRelease.mockResolvedValue(value)
      await controller.check()
      expect(controller.state.status).toBe('failed')
      expect(controller.state.latest).toBeNull()
      expect(controller.expectUpdate()).toBe(false)
    }
  )

  it('keeps the update entry after a network failure and recovers later', async () => {
    fetchRelease.mockResolvedValue({ ...current, buildId: 'B' })
    await controller.check()
    fetchRelease.mockRejectedValue(new Error('Offline'))
    await controller.check()
    expect(controller.state.status).toBe('failed')
    expect(controller.state.latest.buildId).toBe('B')
    fetchRelease.mockResolvedValue(current)
    await controller.check()
    expect(controller.state.status).toBe('current')
  })

  it('times out even if the transport ignores cancellation', async () => {
    jest.useFakeTimers()
    try {
      fetchRelease.mockImplementation(() => new Promise(() => undefined))
      const pending = controller.check()
      await jest.advanceTimersByTimeAsync(5000)
      await pending
      expect(controller.state.status).toBe('failed')
      expect(fetchRelease.mock.calls[0][0].aborted).toBe(true)
    } finally {
      jest.useRealTimers()
    }
  })

  it('continues without storage access', async () => {
    const denied = () => {
      throw new Error('Storage denied')
    }
    const privatePage = new WebUpdateController(
      current,
      fetchRelease,
      { getItem: denied, setItem: denied, removeItem: denied },
      jest.fn()
    )
    fetchRelease.mockResolvedValue({ ...current, buildId: 'B' })
    await privatePage.check()
    privatePage.dismiss()
    expect(privatePage.state.dismissed).toBe(true)
    expect(privatePage.expectUpdate()).toBe(true)
  })
})
