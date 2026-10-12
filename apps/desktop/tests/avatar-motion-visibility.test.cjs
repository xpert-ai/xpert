const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { runInNewContext } = require('node:vm')
const { JSDOM } = require('jsdom')
const ts = require('typescript')

function fixture() {
  const dom = new JSDOM('<body><main></main><section></section></body>', { pretendToBeVisual: true })
  const { window } = dom
  const frames = new Map()
  const listeners = new Set()
  let nextFrame = 0
  let time = 0
  let intersections
  let subscriptions = 0
  let reads = 0
  let writes = 0
  const media = new Map()
  window.matchMedia = (query) => {
    const result = new window.EventTarget()
    result.matches = query === '(any-pointer: fine)'
    media.set(query, result)
    return result
  }
  window.xpertDesktop = {
    onAvatarPointer(listener) {
      subscriptions++
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
  const scope = {
    window,
    document: window.document,
    SVGSVGElement: window.SVGSVGElement,
    MutationObserver: window.MutationObserver,
    IntersectionObserver: class {
      constructor(callback) {
        intersections = callback
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
    requestAnimationFrame(callback) {
      frames.set(++nextFrame, callback)
      return nextFrame
    },
    cancelAnimationFrame(id) {
      frames.delete(id)
    }
  }
  const load = (file, require) => {
    const exports = {}
    runInNewContext(
      ts.transpileModule(readFileSync(join(__dirname, '../src/avatar', file), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
      }).outputText,
      { ...scope, exports, require }
    )
    return exports
  }
  const gaze = load('gaze.ts')
  const { followAvatarPointer } = load('motion.ts', () => gaze)
  const disposers = []
  const face = (parent = window.document.querySelector('main')) => {
    const node = window.document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    node.setAttribute('aria-hidden', 'true')
    const parts = Array.from({ length: 3 }, () => {
      const part = window.document.createElementNS('http://www.w3.org/2000/svg', 'g')
      const set = part.setAttribute.bind(part)
      part.setAttribute = (...args) => {
        writes++
        set(...args)
      }
      node.append(part)
      return part
    })
    node.getBoundingClientRect = () => {
      reads++
      return { left: 10, top: 20, width: 40, height: 40 }
    }
    parent.append(node)
    disposers.push(followAvatarPointer(node, ...parts))
    intersections([{ target: node, isIntersecting: true }])
    return parts
  }
  return {
    window,
    frames,
    listeners,
    media,
    face,
    counts: () => ({ reads, writes, subscriptions }),
    move: (point) => {
      for (const callback of listeners) callback(point)
    },
    settle: () => {
      for (let i = 0; frames.size && i < 120; i++) {
        const batch = [...frames.values()]
        frames.clear()
        time += 16
        batch.forEach((callback) => callback(time))
      }
      assert.equal(frames.size, 0, 'animation must settle')
    },
    flush: () => new Promise((resolve) => window.queueMicrotask(resolve)),
    close: () => {
      disposers.forEach((dispose) => dispose())
      dom.window.close()
    }
  }
}

test('modal background avatars freeze, unsubscribe and resume after the modal closes', async () => {
  const f = fixture()
  try {
    const parts = f.face()
    f.move({ x: 300, y: 200 })
    f.settle()
    assert.equal(f.listeners.size, 1, 'decorative SVG aria-hidden does not block its gaze')
    const pose = parts.map((part) => part.getAttribute('transform'))
    const before = f.counts()
    const main = f.window.document.querySelector('main')
    main.setAttribute('aria-hidden', 'true')
    await f.flush()
    assert.equal(f.listeners.size, 0)
    f.move({ x: -100, y: -100 })
    f.settle()
    assert.deepEqual(f.counts(), before, 'covered avatars must not read layout or write transforms')
    assert.deepEqual(
      parts.map((part) => part.getAttribute('transform')),
      pose,
      'no snap beneath the blur'
    )
    main.removeAttribute('aria-hidden')
    await f.flush()
    assert.equal(f.listeners.size, 1)
    f.move({ x: -100, y: -100 })
    f.settle()
    assert.notDeepEqual(
      parts.map((part) => part.getAttribute('transform')),
      pose
    )
  } finally {
    f.close()
  }
})

test('a foreground avatar still follows the pointer while inert background avatars remain frozen', async () => {
  const f = fixture()
  try {
    const background = f.face()
    const foreground = f.face(f.window.document.querySelector('section'))
    f.move({ x: 300, y: 200 })
    f.settle()
    const pose = background.map((part) => part.getAttribute('transform'))
    f.window.document.querySelector('main').setAttribute('inert', '')
    await f.flush()
    assert.equal(f.listeners.size, 1)
    f.move({ x: -100, y: -100 })
    f.settle()
    assert.deepEqual(
      background.map((part) => part.getAttribute('transform')),
      pose
    )
    assert.notDeepEqual(
      foreground.map((part) => part.getAttribute('transform')),
      pose
    )
  } finally {
    f.close()
  }
})

test('settled poses are not rewritten, and cleanup cancels scheduled work', () => {
  const f = fixture()
  f.face()
  f.move({ x: 300, y: 200 })
  f.settle()
  const before = f.counts().writes
  f.move({ x: 300, y: 200 })
  f.settle()
  assert.equal(f.counts().writes, before)
  f.move({ x: -100, y: -100 })
  assert.equal(f.frames.size, 1)
  f.close()
  assert.equal(f.listeners.size, 0)
  assert.equal(f.frames.size, 0)
})
