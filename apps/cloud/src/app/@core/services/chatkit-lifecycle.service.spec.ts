import { ChatkitLifecycleService } from './chatkit-lifecycle.service'

describe('ChatKit page lifecycle', () => {
  it('asks the currently mounted ChatKit, including late mounts, and cleans up', async () => {
    const service = new ChatkitLifecycleService()
    const host = document.createElement('div')
    const stop = service.register(host)
    expect(await service.prepareLeave()).toBe(true)
    const element = document.createElement('xpertai-chatkit')
    const prepareLeave = jest.fn(async () => false)
    Object.assign(element, { prepareLeave })
    host.append(element)
    expect(await service.prepareLeave()).toBe(false)
    prepareLeave.mockResolvedValue(true)
    expect(await service.prepareLeave()).toBe(true)
    stop()
    prepareLeave.mockClear()
    expect(await service.prepareLeave()).toBe(true)
    expect(prepareLeave).not.toHaveBeenCalled()
  })
  it('does not hang navigation if the mounted client stops replying', async () => {
    jest.useFakeTimers()
    try {
      const service = new ChatkitLifecycleService()
      const element = document.createElement('xpertai-chatkit')
      Object.assign(element, { prepareLeave: () => new Promise<boolean>(() => {}) })
      service.register(element)
      const pending = service.prepareLeave()
      jest.advanceTimersByTime(15000)
      expect(await pending).toBe(false)
    } finally {
      jest.useRealTimers()
    }
  })
  it('fails closed when a mounted client cannot confirm or saving fails', async () => {
    const service = new ChatkitLifecycleService()
    const element = document.createElement('xpertai-chatkit')
    service.register(element)
    expect(await service.prepareLeave()).toBe(false)
    Object.assign(element, { prepareLeave: async () => { throw new Error('Save failed') } })
    expect(await service.prepareLeave()).toBe(false)
  })
})
