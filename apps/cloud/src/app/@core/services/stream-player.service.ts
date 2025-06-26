import { Injectable, signal } from "@angular/core"

@Injectable()
export class TtsStreamPlayerService {
  private audioContext: AudioContext
  private sampleRate = 24000
  private queue: AudioBuffer[] = []
  readonly isPlaying = signal(false)

  constructor() {
    this.audioContext = new AudioContext({ sampleRate: this.sampleRate })
  }

  /**
   * 添加 chunk 到播放队列
   */
  enqueueChunk(base64Data: string) {
    const buffer = this.base64ToArrayBuffer(base64Data)
    const int16Array = new Int16Array(buffer)

    const float32Array = new Float32Array(int16Array.length)
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768
    }

    const audioBuffer = this.audioContext.createBuffer(1, float32Array.length, this.sampleRate)
    audioBuffer.copyToChannel(float32Array, 0)

    this.queue.push(audioBuffer)
    this.startQueueIfNeeded()
  }

  /**
   * 启动播放队列（如果没有正在播放）
   */
  private async startQueueIfNeeded() {
    if (this.isPlaying() || this.queue.length === 0) return

    this.isPlaying.set(true)
    await this.audioContext.resume()

    while (this.queue.length > 0) {
      const nextBuffer = this.queue.shift()!
      await this.playAudioBuffer(nextBuffer)
    }

    this.isPlaying.set(false)
  }

  /**
   * 播放一个 AudioBuffer，并等待播放完成
   */
  private playAudioBuffer(buffer: AudioBuffer): Promise<void> {
    return new Promise((resolve) => {
      const source = this.audioContext.createBufferSource()
      source.buffer = buffer
      source.connect(this.audioContext.destination)
      source.onended = () => resolve()
      source.start()
    })
  }

  /**
   * 将 base64 字符串转换为 ArrayBuffer
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64)
    const len = binaryString.length
    const bytes = new Uint8Array(len)
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    return bytes.buffer
  }

  async stop() {
    if (this.isPlaying()) {
      await this.audioContext.close()
      this.audioContext = new AudioContext({ sampleRate: this.sampleRate })
      this.isPlaying.set(false)
    }
    this.queue = []
  }
}
