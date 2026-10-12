import { openAudioDevices, encodeCaptureWav } from './browser-audio-devices'

const stream = (audio = true) => {
  const track = { stop: jest.fn() }
  return { track, getTracks: () => [track], getAudioTracks: () => (audio ? [track] : []) }
}
class Context {
  sampleRate = 24000
  close = jest.fn(async () => undefined)
  resume = jest.fn(async () => undefined)
}

describe('browser audio devices', () => {
  const originalContext = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext')
  const originalMedia = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices')
  afterEach(() => {
    if (originalContext) Object.defineProperty(globalThis, 'AudioContext', originalContext)
    else Reflect.deleteProperty(globalThis, 'AudioContext')
    if (originalMedia) Object.defineProperty(navigator, 'mediaDevices', originalMedia)
    else Reflect.deleteProperty(navigator, 'mediaDevices')
  })
  it('encodes independent mono 24 kHz PCM16 WAV files including a short final block', () => {
    const buffer = encodeCaptureWav(new Float32Array([-2, -1, 0, 1, 2]))
    const view = new DataView(buffer)
    expect(buffer.byteLength).toBe(54)
    expect(view.getUint32(24, true)).toBe(24000)
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint16(34, true)).toBe(16)
    expect(view.getUint32(40, true)).toBe(10)
    expect([0, 1, 2, 3, 4].map((i) => view.getInt16(44 + i * 2, true))).toEqual([-32768, -32768, 0, 32767, 32767])
  })
  it('rejects silent video-only sharing and releases the shared source without requesting microphone', async () => {
    const shared = stream(false),
      context = new Context(),
      microphone = jest.fn()
    Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: jest.fn(() => context) })
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getDisplayMedia: jest.fn(async () => shared),
        getUserMedia: microphone
      }
    })
    await expect(openAudioDevices(true, new AbortController().signal)).rejects.toThrow('shared_audio_missing')
    expect(microphone).not.toHaveBeenCalled()
    expect(shared.track.stop).toHaveBeenCalled()
    expect(context.close).toHaveBeenCalled()
  })
  it('releases a device that resolves after the user cancelled the permission dialog', async () => {
    const mic = stream(),
      controller = new AbortController(),
      context = new Context()
    let resolve!: (value: typeof mic) => void
    Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: jest.fn(() => context) })
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: jest.fn(
          () =>
            new Promise<typeof mic>((done) => {
              resolve = done
            })
        )
      }
    })
    const pending = openAudioDevices(false, controller.signal)
    controller.abort()
    resolve(mic)
    await expect(pending).rejects.toThrow('cancelled')
    expect(mic.track.stop).toHaveBeenCalled()
    expect(context.close).toHaveBeenCalled()
  })
  it('releases screen sharing when microphone permission is denied', async () => {
    const shared = stream(),
      context = new Context()
    Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: jest.fn(() => context) })
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getDisplayMedia: jest.fn(async () => shared),
        getUserMedia: jest.fn(async () => {
          throw new Error('denied')
        })
      }
    })
    await expect(openAudioDevices(true, new AbortController().signal)).rejects.toThrow('denied')
    expect(shared.track.stop).toHaveBeenCalled()
  })
  it('handles engine failure immediately and releases microphone permission granted afterwards', async () => {
    const mic = stream(),
      context = new Context()
    context.resume.mockRejectedValue(new Error('engine_failed'))
    let resolve!: (value: typeof mic) => void
    Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: jest.fn(() => context) })
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: jest.fn(
          () =>
            new Promise<typeof mic>((done) => {
              resolve = done
            })
        )
      }
    })
    await expect(openAudioDevices(false, new AbortController().signal)).rejects.toThrow('engine_failed')
    expect(context.close).toHaveBeenCalled()
    resolve(mic)
    await Promise.resolve()
    expect(mic.track.stop).toHaveBeenCalled()
  })
})
