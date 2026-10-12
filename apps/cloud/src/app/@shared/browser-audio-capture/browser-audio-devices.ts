import type { AudioCaptureTrack } from '@xpert-ai/desktop-protocol/audio-capture'

export type BrowserAudioDevices = { microphone: MediaStream; system?: MediaStream; context: AudioContext }
export const browserCaptureSupported = () =>
  !!(
    globalThis.isSecureContext &&
    navigator.mediaDevices?.getUserMedia &&
    globalThis.AudioContext &&
    globalThis.AudioWorkletNode
  )

export function closeAudioDevices(devices: BrowserAudioDevices) {
  devices.microphone.getTracks().forEach((track) => track.stop())
  devices.system?.getTracks().forEach((track) => track.stop())
  void devices.context.close().catch(() => undefined)
}

/** Called directly by a host button: display capture requires transient user activation. */
export async function openAudioDevices(shared: boolean, signal: AbortSignal): Promise<BrowserAudioDevices> {
  const context = new AudioContext({ sampleRate: 24000 })
  const streams: MediaStream[] = []
  let closed = false
  const cleanup = () => {
    closed = true
    streams.forEach((stream) => stream.getTracks().forEach((track) => track.stop()))
    void context.close().catch(() => undefined)
  }
  signal.addEventListener('abort', cleanup, { once: true })
  const acquire = async (promise: Promise<MediaStream>) => {
    const stream = await promise
    streams.push(stream)
    if (signal.aborted || closed) {
      stream.getTracks().forEach((track) => track.stop())
      throw new Error('cancelled')
    }
    return stream
  }
  try {
    if (signal.aborted) throw new Error('cancelled')
    if (context.sampleRate !== 24000) throw new Error('unsupported')
    // Start both operations in the click handler and observe rejection immediately.
    const [, { microphone, system }] = await Promise.all([
      context.resume(),
      (async () => {
        const system = shared
          ? await acquire(navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }))
          : undefined
        if (system && !system.getAudioTracks().length) throw new Error('shared_audio_missing')
        const microphone = await acquire(
          navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 }, video: false })
        )
        return { microphone, system }
      })()
    ])
    if (signal.aborted) throw new Error('cancelled')
    return { context, microphone, system }
  } catch (error) {
    cleanup()
    throw error
  } finally {
    signal.removeEventListener('abort', cleanup)
  }
}

export function encodeCaptureWav(pcm: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + pcm.length * 2)
  const view = new DataView(buffer)
  const ascii = (offset: number, value: string) =>
    [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)))
  ascii(0, 'RIFF')
  view.setUint32(4, buffer.byteLength - 8, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, 24000, true)
  view.setUint32(28, 48000, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  ascii(36, 'data')
  view.setUint32(40, pcm.length * 2, true)
  pcm.forEach((value, i) => {
    const sample = Math.max(-1, Math.min(1, value))
    view.setInt16(44 + i * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true)
  })
  return buffer
}

type WorkletMessage =
  | { type: 'level'; value: number }
  | { type: 'stopped' }
  | { type: 'pcm'; pcm: Float32Array; start: number; end: number }

export async function connectAudioDevices(
  devices: BrowserAudioDevices,
  onChunk: (track: AudioCaptureTrack, pcm: Float32Array, start: number, end: number) => void,
  onLevel: (track: AudioCaptureTrack, value: number) => void
) {
  await devices.context.audioWorklet.addModule(new URL('assets/audio/browser-pcm-worklet.js', document.baseURI).href)
  const stops: (() => Promise<void>)[] = []
  for (const track of ['microphone', 'system'] as const) {
    const stream = devices[track]
    if (!stream) continue
    const source = devices.context.createMediaStreamSource(new MediaStream(stream.getAudioTracks()))
    const worklet = new AudioWorkletNode(devices.context, 'browser-pcm-capture')
    let stopped: (() => void) | undefined
    worklet.port.onmessage = ({ data }: MessageEvent<WorkletMessage>) => {
      if (data.type === 'pcm') onChunk(track, data.pcm, (data.start * 1000) / 24000, (data.end * 1000) / 24000)
      if (data.type === 'level') onLevel(track, data.value)
      if (data.type === 'stopped') stopped?.()
    }
    source.connect(worklet).connect(devices.context.destination)
    stops.push(
      () =>
        new Promise<void>((resolve) => {
          const finish = () => {
            clearTimeout(timer)
            source.disconnect()
            worklet.disconnect()
            worklet.port.close()
            resolve()
          }
          // A suspended/crashed audio process cannot acknowledge. Always release devices.
          const timer = setTimeout(finish, 1500)
          stopped = finish
          worklet.port.postMessage('stop')
        })
    )
  }
  return async () => {
    await Promise.all(stops.map((stop) => stop()))
    closeAudioDevices(devices)
  }
}
