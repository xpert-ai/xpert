import { BrowserAudioDeliveryItem, BrowserAudioDeliveryQueue } from './browser-audio-delivery'

const created: BrowserAudioDeliveryItem = {
  type: 'event',
  input: {
    version: 1,
    captureId: 'capture',
    eventId: 'capture:created',
    event: 'created',
    createdAt: 0,
    tracks: ['microphone']
  }
}
const chunk: BrowserAudioDeliveryItem = {
  type: 'chunk',
  buffer: new ArrayBuffer(100),
  input: {
    version: 1,
    captureId: 'capture',
    track: 'microphone',
    sequence: 0,
    startMs: 0,
    endMs: 1,
    sha256: 'same-hash'
  }
}

describe('browser audio delivery', () => {
  it('retains the failed item and ordering, and retries the exact same bytes and ids', async () => {
    const send = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined)
    const queue = new BrowserAudioDeliveryQueue(send)
    queue.add(created)
    queue.add(chunk)
    await queue.flush()
    expect(queue.count).toBe(1)
    expect(queue.bytes).toBe(100)
    expect(queue.errorCode).toBe('upload_failed')
    await queue.flush()
    expect(send.mock.calls.map(([item]) => item)).toEqual([created, chunk, chunk])
    expect(send.mock.calls[1][0]).toBe(send.mock.calls[2][0])
    expect(queue.count).toBe(0)
    expect(queue.bytes).toBe(0)
    expect(queue.errorCode).toBeNull()
  })
  it('coalesces overlapping retries and never sends later items after a scope rejection', async () => {
    let reject!: (error: Error) => void
    const send = jest.fn(
      () =>
        new Promise<void>((_, no) => {
          reject = no
        })
    )
    const queue = new BrowserAudioDeliveryQueue(send)
    queue.add(created)
    queue.add(chunk)
    const first = queue.flush(),
      second = queue.flush()
    expect(first).toBe(second)
    reject(new Error('scope_changed'))
    await first
    expect(send).toHaveBeenCalledTimes(1)
    expect(queue.count).toBe(2)
    expect(queue.errorCode).toBe('scope_changed')
  })
})
