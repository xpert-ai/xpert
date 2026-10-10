const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
test(
  'native conversion accepts CMSampleBuffers and produces audible 24 kHz mono WAV',
  { skip: process.platform !== 'darwin' },
  () => {
    const helper = path.join(__dirname, '../../resources/audio-capture/audio-capture')
    const events = execFileSync(helper, ['--self-test'], { encoding: 'utf8', maxBuffer: 2000000, timeout: 10000 })
      .trim()
      .split('\n')
      .map(JSON.parse)
    assert.equal(
      events.some((event) => event.type === 'self_test' && event.passed),
      true
    )
    for (const track of ['microphone', 'system']) {
      const chunks = events.filter((event) => event.type === 'chunk' && event.track === track)
      assert.equal(chunks.length, 1)
      const bytes = Buffer.from(chunks[0].wav, 'base64')
      assert.equal(bytes.toString('ascii', 0, 4), 'RIFF')
      assert.equal(bytes.readUInt32LE(24), 24000)
      assert.equal(bytes.readUInt16LE(22), 1)
      assert.ok(chunks[0].endMs >= 4990 && chunks[0].endMs <= 5000)
      let energy = 0
      for (let offset = 44; offset < bytes.length; offset += 2) energy += (bytes.readInt16LE(offset) / 32768) ** 2
      assert.ok(Math.sqrt(energy / ((bytes.length - 44) / 2)) > 0.1)
    }
  }
)
