const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { execFileSync, spawn, spawnSync } = require('node:child_process')
let directory, helper
before(() => {
  if (process.platform !== 'darwin') return
  directory = mkdtempSync(path.join(tmpdir(), 'xpert-audio-native-test-'))
  helper = path.join(directory, 'audio-capture-tests')
  const arch = process.arch === 'arm64' ? 'arm64' : 'x86_64'
  execFileSync(
    'xcrun',
    [
      'swiftc',
      '-parse-as-library',
      '-O',
      '-target',
      `${arch}-apple-macosx15.0`,
      ...['AudioCapture.swift', 'SystemAudioTap.swift', 'CaptureTestMain.swift'].map((file) =>
        path.join(__dirname, file)
      ),
      '-o',
      helper
    ],
    { stdio: 'pipe', timeout: 60000 }
  )
})
after(() => {
  if (directory) rmSync(directory, { recursive: true, force: true })
})

test(
  'production helper exposes capability checks without shipping the synthetic test entry',
  { skip: process.platform !== 'darwin' },
  () => {
    const production = path.join(__dirname, '../../resources/audio-capture/audio-capture')
    const capability = JSON.parse(execFileSync(production, ['--check'], { encoding: 'utf8', timeout: 10000 }))
    assert.equal(capability.type, 'capability')
    const removedMode = spawnSync(production, ['--self-test'], { encoding: 'utf8', timeout: 10000 })
    assert.equal(removedMode.status, 1)
    assert.equal(removedMode.stdout, '')
  }
)
test(
  'native conversion accepts CMSampleBuffers and produces audible 24 kHz mono WAV',
  { skip: process.platform !== 'darwin' },
  () => {
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

for (const mode of ['pending-start', 'start-deadline']) {
  test(
    `native ${mode} queues stop behind blocked device startup and rejects late completion`,
    { skip: process.platform !== 'darwin' },
    async () => {
      const child = spawn(helper, [`--self-test-${mode}`], { stdio: ['pipe', 'pipe', 'pipe'] })
      const events = []
      let buffer = '',
        stderr = ''
      child.stderr.on('data', (bytes) => {
        stderr += bytes
      })
      child.stdout.on('data', (bytes) => {
        buffer += bytes
        let index
        while ((index = buffer.indexOf('\n')) >= 0) {
          const event = JSON.parse(buffer.slice(0, index))
          buffer = buffer.slice(index + 1)
          events.push(event)
          if (event.type === 'test_start_pending' && mode === 'pending-start') child.stdin.end('\n')
        }
      })
      const timeout = setTimeout(() => child.kill('SIGKILL'), 3000)
      try {
        const result = await new Promise((resolve, reject) => {
          child.once('error', reject)
          child.once('close', (code, signal) => resolve({ code, signal }))
        })
        assert.deepEqual(result, { code: 0, signal: null }, stderr)
        assert.equal(events.filter((event) => event.type === 'stopped').length, 1)
        assert.equal(
          events.some((event) => event.type === 'started'),
          false
        )
        assert.ok(
          events.findIndex((event) => event.type === 'test_device_released') <
            events.findIndex((event) => event.type === 'stopped')
        )
        if (mode === 'start-deadline') {
          assert.deepEqual(
            events.filter((event) => event.type === 'error'),
            [{ type: 'error', code: 'audio_start_timeout' }]
          )
          assert.ok(
            events.findIndex((event) => event.type === 'error') <
              events.findIndex((event) => event.type === 'test_device_released')
          )
        } else {
          assert.equal(
            events.some((event) => event.type === 'error'),
            false
          )
        }
      } finally {
        clearTimeout(timeout)
        child.kill()
      }
    }
  )
}

test(
  'CoreAudio input preserves buffer ownership, negotiated clock duration, stereo audio and silence',
  { skip: process.platform !== 'darwin' },
  () => {
    const events = execFileSync(helper, ['--self-test-system-input'], {
      encoding: 'utf8',
      maxBuffer: 3000000,
      timeout: 10000
    })
      .trim()
      .split('\n')
      .map(JSON.parse)
    assert.equal(
      events.some((event) => event.type === 'self_test' && event.passed),
      true
    )
    for (const name of ['stereo48', 'stereo44', 'negotiated44', 'silent']) {
      const chunks = events.filter((event) => event.type === 'chunk' && event.track === name)
      assert.equal(chunks.length, 1)
      const bytes = Buffer.from(chunks[0].wav, 'base64')
      assert.equal(bytes.readUInt32LE(24), 24000)
      assert.equal(bytes.readUInt16LE(22), 1)
      assert.ok(chunks[0].endMs > 4990 && chunks[0].endMs <= 5000)
      let energy = 0
      for (let offset = 44; offset < bytes.length; offset += 2) energy += (bytes.readInt16LE(offset) / 32768) ** 2
      if (name === 'silent') assert.equal(energy, 0)
      else assert.ok(Math.sqrt(energy / ((bytes.length - 44) / 2)) > 0.1)
    }
  }
)

test(
  'system input bounds overflow errors and keeps capture-time formats across queued rate changes',
  { skip: process.platform !== 'darwin' },
  () => {
    const events = execFileSync(helper, ['--self-test-input-queue'], {
      encoding: 'utf8',
      maxBuffer: 2000000,
      timeout: 10000
    })
      .trim()
      .split('\n')
      .map(JSON.parse)
    assert.equal(
      events.some((event) => event.type === 'self_test' && event.passed),
      true
    )
    const chunks = events.filter((event) => event.type === 'chunk' && event.track === 'ratechange')
    assert.equal(chunks.length, 1)
    assert.ok(chunks[0].endMs > 4990 && chunks[0].endMs <= 5000)
    const bytes = Buffer.from(chunks[0].wav, 'base64')
    // Both halves must survive reuse of the borrowed input memory and resample correctly.
    for (const [start, end] of [
      [44, 120044],
      [120044, bytes.length]
    ]) {
      let energy = 0
      for (let offset = start; offset < end; offset += 2) energy += (bytes.readInt16LE(offset) / 32768) ** 2
      assert.ok(Math.sqrt(energy / ((end - start) / 2)) > 0.1)
    }
  }
)

test(
  'Core Audio permission denial remains distinct from a missing device',
  { skip: process.platform !== 'darwin' },
  () => {
    const result = JSON.parse(execFileSync(helper, ['--self-test-permissions'], { encoding: 'utf8', timeout: 10000 }))
    assert.deepEqual(result, { type: 'self_test', passed: true })
  }
)
