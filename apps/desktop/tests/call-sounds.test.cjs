const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { runInNewContext } = require('node:vm')
const ts = require('typescript')
const code = ts.transpileModule(readFileSync(join(__dirname, '../src/voice/call-sounds.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText
const exportsForTest = {}
runInNewContext(code, { exports: exportsForTest })

function audio(sampleRate) {
  const sources = []
  const context = {
    sampleRate,
    destination: {},
    createBuffer: (_channels, length) => {
      const data = new Float32Array(length)
      return { getChannelData: () => data }
    },
    createBufferSource: () => {
      const source = {
        starts: 0,
        stops: 0,
        disconnected: false,
        connect(target) {
          this.target = target
        },
        start() {
          this.starts++
        },
        stop() {
          this.stops++
        },
        disconnect() {
          this.disconnected = true
        }
      }
      sources.push(source)
      return source
    }
  }
  return { sounds: new exportsForTest.CallSounds(context), sources, context }
}
const audible = (samples) => samples.some((value) => Math.abs(value) > 0.01)
test('ringback loops a gentle pulse and silence at device sample rates, routed only to speakers', () => {
  for (const rate of [44100, 48000]) {
    const { sounds, sources, context } = audio(rate)
    sounds.startRinging()
    const ring = sources[0],
      pcm = ring.buffer.getChannelData(0)
    assert.equal(ring.loop, true)
    assert.equal(ring.target, context.destination)
    assert.equal(pcm.length, rate * 3)
    assert.equal(audible(pcm.subarray(0, rate)), true)
    assert.equal(audible(pcm.subarray(rate)), false)
    assert.ok(pcm.every((value) => Math.abs(value) <= 0.101))
    assert.equal(pcm[0], 0)
    assert.equal(Math.abs(pcm[rate - 1]), 0)
    sounds.stopRinging()
    assert.equal(ring.stops, 1)
    assert.equal(ring.disconnected, true)
  }
})
test('hangup replaces the ring with two brief notes and disposal silences all sources', () => {
  const { sounds, sources } = audio(48000)
  sounds.startRinging()
  assert.equal(sounds.hangUp(), 320)
  assert.equal(sources[0].stops, 1)
  const end = sources[1],
    pcm = end.buffer.getChannelData(0)
  assert.equal(end.loop, false)
  assert.equal(end.starts, 1)
  assert.equal(audible(pcm.subarray(0, 5760)), true)
  assert.equal(audible(pcm.subarray(5760, 7680)), false)
  assert.equal(audible(pcm.subarray(7680, 13440)), true)
  assert.equal(audible(pcm.subarray(13440)), false)
  sounds.dispose()
  sounds.dispose()
  assert.equal(end.stops, 1)
  assert.equal(end.disconnected, true)
})
test('unavailable progress audio does not throw or delay cleanup', () => {
  const sounds = new exportsForTest.CallSounds({
    createBuffer() {
      throw new Error('audio unavailable')
    }
  })
  assert.doesNotThrow(() => sounds.startRinging())
  assert.equal(sounds.hangUp(), 0)
  assert.doesNotThrow(() => sounds.dispose())
})
