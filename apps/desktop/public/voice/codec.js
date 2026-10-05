// Stateful box-filter resampling preserves fractional positions across audio render quanta.
export class CapturePcm {
  constructor(rate) {
    this.ratio = rate / 16000
    this.remaining = this.ratio
    this.area = 0
    this.frame = new Int16Array(320)
    this.offset = 0
  }
  push(input, emit) {
    for (const sample of input) {
      let available = 1
      while (available > 1e-9) {
        const weight = Math.min(available, this.remaining)
        this.area += sample * weight
        this.remaining -= weight
        available -= weight
        if (this.remaining < 1e-9) {
          const value = Math.max(-1, Math.min(1, this.area / this.ratio))
          this.frame[this.offset++] = Math.round(value * (value < 0 ? 32768 : 32767))
          this.remaining = this.ratio
          this.area = 0
          if (this.offset === 320) {
            const bytes = new ArrayBuffer(640)
            const view = new DataView(bytes)
            for (let i = 0; i < 320; i++) view.setInt16(i * 2, this.frame[i], true)
            emit(bytes)
            this.offset = 0
          }
        }
      }
    }
  }
}

export class PlaybackPcm {
  constructor(rate) {
    this.rate = rate
    this.clear()
  }
  clear() {
    this.queue = []
    this.position = 0
    this.queued = 0
  }
  get pending() {
    return Math.max(0, this.queued - Math.floor(this.position))
  }
  append(bytes) {
    // Generated speech arrives faster than playback. Bound memory, not generation speed.
    if (bytes.byteLength % 2 || this.pending + bytes.byteLength / 2 > 24000 * 30) return false
    const view = new DataView(bytes)
    const samples = new Float32Array(bytes.byteLength / 2)
    for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true) / 32768
    if (samples.length) {
      this.queue.push(samples)
      this.queued += samples.length
    }
    return true
  }
  render(output) {
    let energy = 0
    for (let i = 0; i < output.length; i++) {
      while (this.queue.length && this.position >= this.queue[0].length) {
        const previous = this.queue.shift()
        this.position -= previous.length
        this.queued -= previous.length
      }
      if (!this.queue.length) {
        output[i] = 0
        this.position = 0
        continue
      }
      const frame = this.queue[0]
      const index = Math.floor(this.position)
      const a = frame[index]
      const b = frame[index + 1] ?? this.queue[1]?.[0] ?? a
      output[i] = a + (b - a) * (this.position - index)
      energy += output[i] * output[i]
      this.position += 24000 / this.rate
    }
    while (this.queue.length && this.position >= this.queue[0].length) {
      const previous = this.queue.shift()
      this.position -= previous.length
      this.queued -= previous.length
    }
    if (!this.queue.length) this.position = 0
    return Math.sqrt(energy / output.length)
  }
}
