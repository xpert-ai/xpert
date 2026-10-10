import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'

describe('browser capture worklet', () => {
  it('downmixes channels, emits complete WAV-sized blocks, and flushes the final partial block before acknowledgement', () => {
    type Message = { type: string; pcm?: Float32Array; start?: number; end?: number }
    const messages: Message[] = []
    class Processor {
      port = {
        postMessage: (value: Message) => messages.push(value),
        onmessage: (_event: { data: string }) => undefined
      }
      process(_inputs: Float32Array[][]) {
        return true
      }
    }
    let processor = new Processor()
    runInNewContext(readFileSync(resolve(__dirname, '../../../assets/audio/browser-pcm-worklet.js'), 'utf8'), {
      AudioWorkletProcessor: Processor,
      Float32Array,
      registerProcessor: (_name: string, Constructor: typeof Processor) => {
        processor = new Constructor()
      }
    })
    for (let i = 0; i < 939; i++)
      processor.process([[new Float32Array(128).fill(0.25), new Float32Array(128).fill(0.75)]])
    processor.port.onmessage({ data: 'stop' })
    const chunks = messages.filter((item) => item.type === 'pcm')
    expect(chunks.map((item) => [item.start, item.end, item.pcm?.length])).toEqual([
      [0, 120000, 120000],
      [120000, 120192, 192]
    ])
    expect(chunks[0].pcm?.[0]).toBe(0.5)
    expect(messages.at(-1)?.type).toBe('stopped')
    expect(processor.process([])).toBe(false)
  })
})
