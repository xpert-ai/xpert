const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { runInNewContext } = require('node:vm')
const ts = require('typescript')

const code = ts.transpileModule(readFileSync(join(__dirname, '../src/voice/runtime.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText

function runtime(options = {}) {
  const exports = {}
  const sounds = [],
    contexts = [],
    hostCalls = [],
    timeouts = new Map()
  const track = {
    stopped: 0,
    stop() {
      this.stopped++
    },
    addEventListener() {}
  }
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] }
  class AudioContext {
    constructor() {
      contexts.push(this)
      this.closed = 0
      this.destination = {}
      this.audioWorklet = { addModule: async () => {} }
    }
    resume() {
      return options.resume ?? Promise.resolve()
    }
    createMediaStreamSource() {
      return { connect() {}, disconnect() {} }
    }
    async close() {
      this.closed++
    }
  }
  class CallSounds {
    constructor() {
      sounds.push(this)
      this.ringing = false
      this.hangups = 0
    }
    startRinging() {
      this.ringing = true
    }
    stopRinging() {
      this.ringing = false
    }
    hangUp() {
      this.stopRinging()
      this.hangups++
      return 320
    }
    dispose() {
      this.stopRinging()
      this.disposed = true
    }
  }
  class WebSocket {
    static OPEN = 1
    readyState = 1
    send() {}
    close() {}
  }
  class AudioWorkletNode {
    port = { postMessage() {}, close() {} }
    connect() {}
    disconnect() {}
  }
  runInNewContext(code, {
    exports,
    require: (name) =>
      name === './call-sounds'
        ? { CallSounds }
        : {
            invoke: async (method) => {
              hostCalls.push(method)
              return method === 'voiceStart'
                ? {
                    sessionId: 'session',
                    threadId: 'thread',
                    conversationId: 'conversation',
                    ticket: 'test',
                    url: 'ws://local'
                  }
                : { ended: true }
            }
          },
    console: { warn() {} },
    ArrayBuffer,
    AudioContext,
    AudioWorkletNode,
    WebSocket,
    URL,
    DOMException,
    window: {},
    document: { baseURI: 'http://localhost/' },
    navigator: {
      mediaDevices: {
        getUserMedia: () => {
          options.onMedia?.()
          return options.media ?? Promise.resolve(stream)
        }
      }
    },
    setInterval: () => 1,
    clearInterval() {},
    setTimeout: (callback, delay) => {
      const id = Symbol()
      timeouts.set(id, { callback, delay })
      return id
    },
    clearTimeout: (id) => timeouts.delete(id)
  })
  const states = [],
    events = [],
    diagnostics = []
  const call = new exports.VoiceRuntime(
    (state) => states.push(state),
    (event) => events.push(event),
    (diagnostic) => diagnostics.push(diagnostic)
  )
  return { call, states, events, diagnostics, sounds, contexts, track, stream, hostCalls, timeouts }
}

const target = { botId: 'bot', assistantId: 'assistant', threadId: null, name: 'Test' }

test('dialing rings until provider readiness, then hangup releases capture immediately and audio after the cue', async () => {
  const { call, sounds, contexts, track, timeouts } = runtime()
  await call.start(target, () => {})
  assert.equal(sounds[0].ringing, true, 'an open websocket alone is not a connected call')
  call.receive(JSON.stringify({ type: 'ready' }))
  assert.equal(sounds[0].ringing, false)
  call.close()
  call.close()
  call.receive(JSON.stringify({ type: 'ended' }))
  assert.equal(sounds[0].hangups, 1)
  assert.equal(track.stopped, 1)
  assert.equal(contexts[0].closed, 0, 'do not truncate the hangup cue')
  const ending = [...timeouts.values()].find((timer) => timer.delay === 320)
  assert.ok(ending)
  ending.callback()
  assert.equal(contexts[0].closed, 1)
  assert.equal(sounds[0].disposed, true)
  assert.equal(timeouts.size, 0)
})

test('canceling while microphone permission is pending stops ringing and releases a late microphone without dialing', async () => {
  let resolveMedia
  const media = new Promise((resolve) => {
    resolveMedia = resolve
  })
  let mediaRequested
  const requested = new Promise((resolve) => {
    mediaRequested = resolve
  })
  const { call, sounds, stream, track, hostCalls } = runtime({ media, onMedia: mediaRequested })
  const starting = call.start(target, () => assert.fail('canceled call must not change threads'))
  await requested
  assert.equal(sounds[0].ringing, true)
  call.close()
  resolveMedia(stream)
  await starting
  assert.equal(sounds[0].ringing, false)
  assert.equal(sounds[0].hangups, 1)
  assert.equal(track.stopped, 1)
  assert.deepEqual(hostCalls, [])
  call.dispose()
})

test('disposing during audio resume cannot restart ringing or acquire a microphone later', async () => {
  let resolveResume
  const resume = new Promise((resolve) => {
    resolveResume = resolve
  })
  const { call, sounds, contexts, hostCalls, timeouts } = runtime({ resume })
  const starting = call.start(target, () => {})
  call.dispose()
  resolveResume()
  await starting
  assert.equal(sounds[0].ringing, false)
  assert.equal(sounds[0].hangups, 0)
  assert.equal(contexts[0].closed, 1)
  assert.deepEqual(hostCalls, [])
  assert.equal(timeouts.size, 0)
})

test('a remote end or setup error stops ringing and plays only one ending cue', async () => {
  for (const type of ['ended', 'error']) {
    const { call, sounds, states, contexts, timeouts } = runtime()
    await call.start(target, () => {})
    call.receive(JSON.stringify({ type }))
    call.receive(JSON.stringify({ type }))
    assert.equal(sounds[0].ringing, false)
    assert.equal(sounds[0].hangups, 1)
    assert.equal(states.at(-1), type)
    // A redial/unmount disposes the previous ending cue before starting another call.
    call.dispose()
    assert.equal(sounds[0].disposed, true)
    assert.equal(contexts[0].closed, 1)
    assert.equal(timeouts.size, 0)
  }
})

test('an existing task with a null result does not end a newly connected call', () => {
  const { call, states, events, diagnostics } = runtime()
  call.receive(
    JSON.stringify({ type: 'task', action: 'send', taskId: 'existing-task', status: 'completed', text: null })
  )
  call.receive(JSON.stringify({ type: 'ready', sessionId: 'call' }))
  assert.deepEqual(diagnostics, [])
  assert.deepEqual(states, ['listening'])
  assert.equal(events[0].type, 'task')
  assert.equal(events[0].text, undefined)
})

test('malformed non-string task results still fail validation', () => {
  for (const text of [42, { text: 'invalid' }, ['invalid']]) {
    const { call, states, diagnostics } = runtime()
    call.receive(JSON.stringify({ type: 'task', action: 'send', taskId: 'task', status: 'completed', text }))
    assert.deepEqual(diagnostics, ['protocol'])
    assert.deepEqual(states, ['error'])
  }
})
