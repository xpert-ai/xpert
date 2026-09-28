const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createPressScroller } = require('../src/press-scroll.ts')

test('press scrolling repeats until release, clamps frame delay, reverses safely and stops at the edge', () => {
  let time = 0,
    id = 0,
    top = 500
  const pending = new Map()
  const viewport = {
    get scrollTop() {
      return top
    },
    set scrollTop(value) {
      top = Math.max(0, Math.min(1000, value))
    }
  }
  const scroller = createPressScroller(() => viewport, {
    request(callback) {
      pending.set(++id, callback)
      return id
    },
    cancel(id) {
      pending.delete(id)
    },
    now: () => time
  })
  const tick = (elapsed) => {
    time += elapsed
    const callbacks = [...pending.values()]
    pending.clear()
    callbacks.forEach((fn) => fn(time))
  }
  scroller.start(1)
  assert.equal(top, 540)
  tick(20)
  assert.equal(top, 549)
  tick(2000)
  assert.equal(top, 567)
  scroller.stop()
  tick(20)
  assert.equal(top, 567)
  assert.equal(pending.size, 0)
  scroller.start(1)
  scroller.start(-1)
  assert.equal(pending.size, 1)
  for (let i = 0; i < 100; i++) tick(40)
  assert.equal(top, 0)
  assert.equal(pending.size, 0)
})
