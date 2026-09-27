const { test } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { runInNewContext } = require('node:vm')
const ts = require('typescript')
const { installAvatarPointer } = require('../electron/avatar-pointer.cjs')

const output = {}
runInNewContext(
  ts.transpileModule(readFileSync(join(__dirname, '../src/avatar/gaze.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText,
  { exports: output }
)
const { avatarGaze, easeGaze, gazeTransforms, restingGaze } = output
const bounds = { left: 10, top: 20, width: 40, height: 40 }
const scale = (transform) => Number(/scale\(([\d.]+)/.exec(transform)[1])

test('gaze follows both axes, with stronger proximity when the pointer is near', () => {
  const near = avatarGaze({ x: 65, y: 60 }, bounds)
  const far = avatarGaze({ x: 1400, y: 1400 }, bounds)
  assert.ok(near.x > 0 && near.y > 0 && far.proximity < near.proximity)
  const left = avatarGaze({ x: -100, y: -100 }, bounds)
  assert.ok(left.x < 0 && left.y < 0)
  assert.equal(avatarGaze({ x: 30, y: 40 }, bounds).x, 0)
})

test('the eye on the gaze side shrinks and the opposite eye grows symmetrically', () => {
  const right = gazeTransforms(avatarGaze({ x: 170, y: 40 }, bounds))
  const left = gazeTransforms(avatarGaze({ x: -110, y: 40 }, bounds))
  assert.ok(scale(right.right) < scale(right.left))
  assert.equal(scale(right.left), scale(left.right))
  assert.equal(scale(right.right), scale(left.left))
  assert.notEqual(right.mouth, left.mouth)
})

test('distant pointers cannot push the face beyond its tile, and missing pointers rest', () => {
  const gaze = avatarGaze({ x: 1e9, y: -1e9 }, bounds)
  assert.ok(Math.abs(gaze.x) <= 1 && Math.abs(gaze.y) <= 1)
  const transforms = gazeTransforms(gaze)
  assert.ok(scale(transforms.left) >= 0.64 && scale(transforms.right) <= 1.48)
  assert.deepEqual(avatarGaze(null, bounds), restingGaze)
  assert.deepEqual(avatarGaze({ x: 10, y: 20 }, { ...bounds, width: 0 }), restingGaze)
})

test('all eight extreme directions remain bounded and visibly turn within a normal window', () => {
  for (const x of [-1, 0, 1]) {
    for (const y of [-1, 0, 1]) {
      if (!x && !y) continue
      const gaze = avatarGaze({ x: 30 + x * 400, y: 40 + y * 400 }, bounds)
      assert.ok(!x || Math.abs(gaze.x) > 0.99)
      assert.ok(!y || Math.abs(gaze.y) > 0.99)
      const transforms = gazeTransforms(gaze)
      for (const eye of [transforms.left, transforms.right]) {
        assert.ok(scale(eye) >= 0.64 && scale(eye) <= 1.48)
        assert.ok(!eye.includes('NaN'))
      }
      if (x) {
        const gazeSide = x > 0 ? transforms.right : transforms.left
        const opposite = x > 0 ? transforms.left : transforms.right
        assert.ok(scale(opposite) / scale(gazeSide) > 2, 'the gaze-side eye should visibly shrink at 40px')
      }
      const extreme = gazeTransforms(avatarGaze({ x: 30 + x * 1e9, y: 40 + y * 1e9 }, bounds))
      assert.equal(extreme.left.split(')')[0], `translate(${(x * 14).toFixed(3)} ${(y * 12).toFixed(3)}`)
      assert.equal(extreme.mouth.split(')')[0], `translate(${(x * 10).toFixed(3)} ${(y * 9).toFixed(3)}`)
    }
  }
})

test('easing settles exactly, without a permanent animation loop or overshoot', () => {
  const target = avatarGaze({ x: 240, y: 80 }, bounds)
  let current = { ...restingGaze }
  for (let i = 0; i < 100; i++) {
    current = easeGaze(current, target, 16)
    assert.ok(current.x >= 0 && current.x <= target.x)
  }
  assert.deepEqual(current, target)
  for (let i = 0; i < 100; i++) current = easeGaze(current, restingGaze, 16)
  assert.deepEqual(current, restingGaze)
})

function fixture() {
  const ipcMain = new EventEmitter()
  const window = new EventEmitter()
  const contents = new EventEmitter()
  const messages = []
  const callbacks = new Set()
  let focused = true
  let visible = true
  let cursor = { x: 160, y: 240 }
  let samples = 0
  window.webContents = contents
  window.isDestroyed = () => false
  window.isFocused = () => focused
  window.isVisible = () => visible
  window.isMinimized = () => false
  window.getContentBounds = () => ({ x: 100, y: 200, width: 800, height: 600 })
  contents.isDestroyed = () => false
  contents.getZoomFactor = () => 2
  contents.send = (channel, point) => messages.push({ channel, point })
  installAvatarPointer(window, {
    ipcMain,
    screen: {
      getCursorScreenPoint: () => {
        samples++
        return cursor
      }
    },
    isTrusted: (event) => event.trusted === true,
    timers: {
      setInterval: (fn) => {
        callbacks.add(fn)
        return fn
      },
      clearInterval: (fn) => callbacks.delete(fn)
    }
  })
  return {
    window,
    contents,
    ipcMain,
    messages,
    callbacks,
    request: (enabled, trusted = true) => ipcMain.emit('xpert:avatar-pointer-tracking', { trusted }, enabled),
    tick: () => {
      for (const callback of callbacks) callback()
    },
    move: (point) => {
      cursor = point
    },
    focus: (value) => {
      focused = value
      window.emit(value ? 'focus' : 'blur')
    },
    show: (value) => {
      visible = value
      window.emit(value ? 'show' : 'hide')
    },
    samples: () => samples
  }
}

test('native tracking requires a trusted opt-in and sends only window-local zoom-corrected positions', () => {
  const f = fixture()
  f.request(true, false)
  f.request('true')
  assert.equal(f.samples(), 0)
  f.request(true)
  assert.deepEqual(f.messages.at(-1).point, { x: 30, y: 20 })
  assert.equal(f.callbacks.size, 1)
  f.tick()
  assert.equal(f.messages.length, 1, 'stationary cursors do not send repeated IPC')
  f.move({ x: 99, y: 400 })
  f.tick()
  assert.equal(f.messages.at(-1).point, null, 'outside screen coordinates are never forwarded')
})

test('native tracking stops on blur/hide/unsubscribe and resumes only if still requested', () => {
  const f = fixture()
  f.request(true)
  f.focus(false)
  assert.equal(f.callbacks.size, 0)
  assert.equal(f.messages.at(-1).point, null)
  f.focus(true)
  assert.equal(f.callbacks.size, 1)
  f.show(false)
  assert.equal(f.callbacks.size, 0)
  f.show(true)
  assert.equal(f.callbacks.size, 1)
  f.request(false)
  f.focus(true)
  assert.equal(f.callbacks.size, 0)
})

test('iframe navigation keeps tracking; replacing the host document clears the subscription', () => {
  const f = fixture()
  f.request(true)
  f.contents.emit('did-start-navigation', { isMainFrame: false, isSameDocument: false })
  assert.equal(f.callbacks.size, 1)
  f.contents.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false })
  assert.equal(f.callbacks.size, 0)
  f.request(true)
  f.window.emit('closed')
  assert.equal(f.callbacks.size, 0)
  assert.equal(f.ipcMain.listenerCount('xpert:avatar-pointer-tracking'), 0)
  assert.equal(f.contents.listenerCount('did-start-navigation'), 0)
})
