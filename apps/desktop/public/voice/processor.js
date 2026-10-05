import { CapturePcm, PlaybackPcm } from './codec.js'
class BosiVoiceProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.capture = new CapturePcm(sampleRate)
    this.player = new PlaybackPcm(sampleRate)
    this.enabled = false
    this.muted = false
    this.quanta = 0
    this.playbackBlocked = false
    this.port.onmessage = ({ data }) => {
      if (data.type === 'response') {
        this.responseId = data.responseId
        this.generationDone = false
        this.playbackBlocked = false
      }
      if (data.type === 'response.done' && data.responseId === this.responseId) this.generationDone = true
      if (data.type === 'audio' && !this.playbackBlocked && !this.player.append(data.audio)) {
        this.player.clear()
        this.playbackBlocked = true
        this.port.postMessage({ type: 'overflow', responseId: this.responseId })
      }
      if (data.type === 'clear') {
        this.player.clear()
        this.responseId = undefined
        this.generationDone = false
      }
      if (data.type === 'enabled') this.enabled = data.value
      if (data.type === 'mute') {
        this.muted = data.value
        this.capture = new CapturePcm(sampleRate)
      }
    }
  }
  process(inputs, outputs) {
    const input = inputs[0]?.[0]
    if (this.enabled && !this.muted && input)
      this.capture.push(input, (audio) => this.port.postMessage({ type: 'audio', audio }, [audio]))
    const output = outputs[0]?.[0]
    if (output) {
      const energy = this.player.render(output)
      if (++this.quanta % 20 === 0)
        this.port.postMessage({
          type: 'level',
          value: energy,
          pending: this.player.pending,
          responseId: this.responseId,
          done: this.generationDone
        })
    }
    return true
  }
}
registerProcessor('bosi-voice', BosiVoiceProcessor)
