type Tone = { start: number; duration: number; frequency: number }

/** Local call progress audio goes straight to the speakers, never through the microphone worklet. */
export class CallSounds {
  private ringing?: AudioBufferSourceNode
  private ending?: AudioBufferSourceNode

  constructor(private readonly context: AudioContext) {}

  startRinging() {
    this.dispose()
    try {
      // One soft ring followed by two seconds of silence; Web Audio keeps the cadence in background tabs.
      this.ringing = this.play(3, [{ start: 0, duration: 1, frequency: 425 }], true)
    } catch {
      /* Optional feedback must not prevent connecting a call. */
    }
  }

  stopRinging() {
    this.stop(this.ringing)
    this.ringing = undefined
  }

  /** Returns the time needed before the owner can close the shared audio context. */
  hangUp(): number {
    this.dispose()
    try {
      this.ending = this.play(0.32, [
        { start: 0, duration: 0.12, frequency: 480 },
        { start: 0.16, duration: 0.12, frequency: 360 }
      ])
      return 320
    } catch {
      return 0
    }
  }

  dispose() {
    this.stopRinging()
    this.stop(this.ending)
    this.ending = undefined
  }

  private play(duration: number, tones: Tone[], loop = false) {
    const rate = this.context.sampleRate
    const buffer = this.context.createBuffer(1, Math.ceil(duration * rate), rate)
    const samples = buffer.getChannelData(0)
    for (const tone of tones) {
      const start = Math.round(tone.start * rate)
      const length = Math.round(tone.duration * rate)
      const fade = Math.round(0.015 * rate)
      for (let i = 0; i < length && start + i < samples.length; i++) {
        const envelope = Math.min(1, i / fade, (length - 1 - i) / fade)
        samples[start + i] = 0.1 * envelope * Math.sin((2 * Math.PI * tone.frequency * i) / rate)
      }
    }
    const source = this.context.createBufferSource()
    source.buffer = buffer
    source.loop = loop
    source.onended = () => source.disconnect()
    try {
      source.connect(this.context.destination)
      source.start()
      return source
    } catch (error) {
      source.disconnect()
      throw error
    }
  }

  private stop(source?: AudioBufferSourceNode) {
    if (!source) return
    try {
      source.stop()
    } catch {
      /* The source may already have finished. */
    }
    source.disconnect()
  }
}
