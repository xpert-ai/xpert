const assert = require('node:assert/strict')
const { test } = require('node:test')
const { createRequire } = require('node:module')
const { resolve, dirname } = require('node:path')
const { execFileSync } = require('node:child_process')
const { build } = require('esbuild')
const root = resolve(__dirname, '../..')
const desktopRequire = createRequire(resolve(root, 'apps/desktop/package.json'))
const { JSDOM } = desktopRequire('jsdom')
const wait = () => new Promise((done) => setTimeout(done, 10))

async function renderer(reactRequire) {
  return (
    await build({
      entryPoints: [resolve(root, 'packages/shadcn-ui/test/nested-dismiss-preview.tsx')],
      bundle: true,
      write: false,
      format: 'iife',
      globalName: 'fixture',
      jsx: 'automatic',
      alias: {
        '@': resolve(root, 'packages/shadcn-ui/src'),
        react: dirname(reactRequire.resolve('react/package.json')),
        'react-dom': dirname(reactRequire.resolve('react-dom/package.json'))
      },
      define: { 'process.env.NODE_ENV': '"development"' },
      logLevel: 'silent',
      // Optional red run against the repository's original components, without changing files.
      ...(process.env.NESTED_DISMISS_BASELINE === '1'
        ? {
            plugins: [
              {
                name: 'baseline',
                setup(build) {
                  build.onLoad({ filter: /components\/ui\/(dialog|sheet)\.tsx$/ }, ({ path }) => ({
                    loader: 'tsx',
                    contents: execFileSync('git', ['show', `HEAD:${path.slice(root.length + 1)}`], {
                      cwd: root,
                      encoding: 'utf8'
                    })
                  }))
                }
              }
            ]
          }
        : {})
    })
  ).outputFiles[0].text
}

async function mount(t, code, options) {
  const dom = new JSDOM('<div id="root"></div>', {
    url: 'http://localhost',
    runScripts: 'outside-only',
    pretendToBeVisual: true
  })
  const { window } = dom
  window.HTMLElement.prototype.scrollIntoView = () => {}
  window.HTMLElement.prototype.hasPointerCapture = () => false
  window.HTMLElement.prototype.releasePointerCapture = () => {}
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.eval(await code)
  let fixture
  window.fixture.flushSync(() => {
    fixture = window.fixture.mount(window.document.getElementById('root'), options)
  })
  await wait()
  await wait()
  t.after(() => {
    window.fixture.flushSync(() => fixture.unmount())
    dom.window.close()
  })
  const query = (selector) => window.document.querySelector(selector)
  const dispatch = (element, event) => window.fixture.flushSync(() => element.dispatchEvent(event))
  const pointer = (type, options = {}) =>
    new window.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...options })
  const click = async (element) => {
    assert.ok(element, 'click target exists')
    // Keep native event phases separate: the Select can unmount before click is delivered.
    dispatch(element, pointer('pointerdown'))
    await wait()
    dispatch(element, pointer('pointerup'))
    dispatch(element, pointer('click'))
    await wait()
  }
  const key = async (element, key) => {
    dispatch(element, new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
    await wait()
  }
  const openSelect = async () => {
    const trigger = query('[role="combobox"]')
    trigger.focus()
    await key(trigger, 'ArrowDown')
    await wait()
    assert.ok(query('[role="listbox"]'))
    assert.equal(query('[data-testid="parent"]').style.pointerEvents, 'none')
  }
  const overlay = () => query(`[data-slot="${options.kind}-overlay"]`)
  return { window, query, click, key, openSelect, overlay, events: fixture.events }
}

for (const [runtime, reactRequire] of [
  ['remote React', require],
  ['Desktop React', desktopRequire]
]) {
  const code = renderer(reactRequire)
  for (const kind of ['dialog', 'sheet']) {
    test(`${runtime} ${kind}: outside gesture closes only Select, next gesture closes parent`, async (t) => {
      const f = await mount(t, code, { kind })
      await f.openSelect()
      await f.click(f.overlay())
      assert.equal(f.query('[role="listbox"]'), null)
      assert.ok(f.query('[data-testid="parent"]'))
      assert.equal(f.window.document.activeElement, f.query('[role="combobox"]'))
      assert.equal(f.events.includes('parent:false'), false)
      await f.click(f.query('[data-testid="blank"]'))
      assert.ok(f.query('[data-testid="parent"]'), 'blank content remains inside the parent')
      await f.click(f.overlay())
      assert.equal(f.query('[data-testid="parent"]'), null)
      assert.equal(f.window.document.body.style.pointerEvents, '', 'dismissal releases the page')
    })
    test(`${runtime} ${kind}: Escape and option selection preserve parent and restore focus`, async (t) => {
      const f = await mount(t, code, { kind })
      await f.openSelect()
      await f.key(f.query('[role="option"]'), 'Escape')
      assert.equal(f.query('[role="listbox"]'), null)
      assert.ok(f.query('[data-testid="parent"]'))
      assert.equal(f.window.document.activeElement, f.query('[role="combobox"]'))
      await f.openSelect()
      await f.key(f.query('[role="option"]'), 'Enter')
      assert.equal(f.query('[role="combobox"]').textContent.trim(), 'Approve')
      assert.ok(f.query('[data-testid="parent"]'))
      await f.key(f.query('[role="combobox"]'), 'Escape')
      assert.equal(f.query('[data-testid="parent"]'), null)
    })
    test(`${runtime} ${kind}: caller cancellation and explicit close still work`, async (t) => {
      const f = await mount(t, code, { kind, blockOutside: true })
      await f.click(f.overlay())
      assert.ok(f.query('[data-testid="parent"]'))
      assert.ok(f.events.includes('outside:false'), 'caller receives ordinary outside interaction')
      await f.openSelect()
      await f.click(f.overlay())
      assert.ok(f.events.includes('outside:true'), 'caller can observe the nested gesture was already consumed')
      await f.click(
        [...f.window.document.querySelectorAll('button')].find((button) => button.textContent === 'Close parent')
      )
      assert.equal(f.query('[data-testid="parent"]'), null)
    })
    test(`${runtime} ${kind}: nested Dialog consumes its own close gesture`, async (t) => {
      const f = await mount(t, code, { kind })
      await f.click(
        [...f.window.document.querySelectorAll('button')].find((button) => button.textContent === 'Open child')
      )
      assert.ok(f.query('[data-testid="child"]'))
      const overlays = f.window.document.querySelectorAll('[data-slot="dialog-overlay"]')
      await f.click(overlays[overlays.length - 1])
      assert.equal(f.query('[data-testid="child"]'), null)
      assert.ok(f.query('[data-testid="parent"]'))
      await f.click(f.overlay())
      assert.equal(f.query('[data-testid="parent"]'), null)
    })
  }
}
