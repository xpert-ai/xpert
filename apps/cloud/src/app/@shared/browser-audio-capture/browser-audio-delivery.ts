import type { AudioCaptureChunk, AudioCaptureEvent } from '@xpert-ai/desktop-protocol/audio-capture'

export type BrowserAudioDeliveryItem =
  | { type: 'event'; input: AudioCaptureEvent }
  | { type: 'chunk'; input: AudioCaptureChunk; buffer: ArrayBuffer }

/** Remove only acknowledged items. Retries reuse the exact event id, chunk sequence and hash. */
export class BrowserAudioDeliveryQueue {
  private readonly items: BrowserAudioDeliveryItem[] = []
  private flight?: Promise<void>
  bytes = 0
  errorCode: string | null = null
  get count() {
    return this.items.length
  }
  constructor(private readonly send: (item: BrowserAudioDeliveryItem) => Promise<void>) {}
  add(item: BrowserAudioDeliveryItem) {
    this.items.push(item)
    if (item.type === 'chunk') this.bytes += item.buffer.byteLength
  }
  flush(): Promise<void> {
    if (this.flight) return this.flight
    this.flight = this.drain().finally(() => {
      this.flight = undefined
    })
    return this.flight
  }
  private async drain() {
    while (this.items.length) {
      const item = this.items[0]
      try {
        await this.send(item)
      } catch (error) {
        this.errorCode = error instanceof Error && error.message === 'scope_changed' ? 'scope_changed' : 'upload_failed'
        return
      }
      this.items.shift()
      if (item.type === 'chunk') this.bytes -= item.buffer.byteLength
      this.errorCode = null
    }
  }
}
