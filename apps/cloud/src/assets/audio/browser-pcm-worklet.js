// Each track emits independent 24 kHz PCM blocks. Output stays silent to avoid feedback.
class BrowserPcmCapture extends AudioWorkletProcessor {
  constructor() {
    super()
    this.buffer = new Float32Array(24000 * 5)
    this.length = 0
    this.samples = 0
    this.done = false
    this.port.onmessage = ({ data }) => {
      if (data === 'stop') {
        this.flush()
        this.done = true
        this.port.postMessage({ type: 'stopped' })
      }
    }
  }
  flush() {
    if (!this.length) return
    const pcm = this.buffer.slice(0, this.length)
    this.port.postMessage({ type: 'pcm', pcm, start: this.samples, end: this.samples + this.length }, [pcm.buffer])
    this.samples += this.length
    this.length = 0
  }
  process(inputs) {
    if (this.done) return false
    const channels = inputs[0]
    if (!channels?.length) return true
    let peak = 0
    for (let i = 0; i < channels[0].length; i++) {
      let sample = 0
      for (const channel of channels) sample += channel[i] / channels.length
      this.buffer[this.length++] = sample
      peak = Math.max(peak, Math.abs(sample))
      if (this.length === this.buffer.length) this.flush()
    }
    if (Math.floor((this.samples + this.length) / 2400) !== this.lastMeter) {
      this.lastMeter = Math.floor((this.samples + this.length) / 2400)
      this.port.postMessage({ type: 'level', value: peak })
    }
    return true
  }
}
registerProcessor('browser-pcm-capture', BrowserPcmCapture)
