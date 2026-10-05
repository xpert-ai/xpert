const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join, dirname, resolve } = require('node:path')
const { runInNewContext } = require('node:vm')
const ts = require('typescript')
const { createRequire } = require('node:module')
const sharedRequire = createRequire(join(__dirname, '../../../package.json'))
const React = sharedRequire('react')
const { JSDOM } = require('jsdom')

function rendererModules(window) {
  const cache = new Map()
  const base = join(__dirname, '../src/avatar')
  const load = (name) => {
    const file = resolve(base, name)
    if (cache.has(file)) return cache.get(file)
    const code = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
    }).outputText
    const exports = {}
    cache.set(file, exports)
    runInNewContext(code, {
      exports,
      window,
      document: window.document,
      setTimeout,
      clearTimeout,
      require(id) {
        if (id === '@xpert-ai/shadcn-ui') {
          const { Popover } = sharedRequire('radix-ui')
          return { Popover: Popover.Root, PopoverTrigger: Popover.Trigger, PopoverContent: Popover.Content }
        }
        if (id === '../i18n') return { t: (key) => key }
        if (id === 'lucide-react')
          return { ChevronLeft: () => null, ChevronRight: () => null, Shuffle: () => null, RotateCcw: () => null }
        if (id === './AnimatedAssistantAvatar') return { AnimatedAssistantAvatar: () => null }
        if (!id.startsWith('.')) return sharedRequire(id)
        const path = resolve(dirname(file), id)
        for (const ext of ['.tsx', '.ts']) {
          try {
            return load(path + ext)
          } catch (error) {
            if (error.code !== 'ENOENT') throw error
          }
        }
        throw new Error(`Missing renderer: ${id}`)
      }
    })
    return exports
  }
  return load
}

test('visual controls preview configurations, support arrow keys and preserve unrelated choices', async (t) => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' })
  const previous = { window: global.window, document: global.document, act: global.IS_REACT_ACT_ENVIRONMENT }
  global.window = dom.window
  global.document = dom.window.document
  global.IS_REACT_ACT_ENVIRONMENT = true
  const browserGlobals = [
    'HTMLElement',
    'HTMLInputElement',
    'Element',
    'Node',
    'NodeFilter',
    'CustomEvent',
    'MutationObserver',
    'getComputedStyle'
  ]
  const savedGlobals = new Map(browserGlobals.map((key) => [key, global[key]]))
  for (const key of browserGlobals) global[key] = dom.window[key]
  let reduced = false
  const mediaListeners = new Set()
  dom.window.matchMedia = () => ({
    get matches() {
      return reduced
    },
    addEventListener: (_, cb) => mediaListeners.add(cb),
    removeEventListener: (_, cb) => mediaListeners.delete(cb)
  })
  const load = rendererModules(dom.window)
  const { CharacterEditor } = load('CharacterEditor.tsx')
  const { CharacterSettings } = load('CharacterSettings.tsx')
  const { defaultCharacterConfig } = load('custom-character.ts')
  const { createRoot } = sharedRequire('react-dom/client')
  const root = createRoot(document.getElementById('root'))
  t.after(async () => {
    await React.act(() => root.unmount())
    dom.window.close()
    global.window = previous.window
    global.document = previous.document
    global.IS_REACT_ACT_ENVIRONMENT = previous.act
    for (const [key, value] of savedGlobals) global[key] = value
  })
  let appearance = {
    version: 1,
    kind: 'character',
    id: 'future-character',
    color: '#18cbb7',
    config: { ...defaultCharacterConfig, tilt: 9, eyeSize: 1.3 }
  }
  let state = 'idle'
  const render = () =>
    root.render(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(
          'section',
          { id: 'studio-left' },
          React.createElement(CharacterEditor, {
            value: appearance,
            state,
            onStateChange(value) {
              state = value
              render()
            },
            onChange: change
          })
        ),
        React.createElement(
          'section',
          { id: 'studio-right' },
          React.createElement(CharacterSettings, { value: appearance, onChange: change })
        )
      )
    )
  function change(value) {
    appearance = value
    render()
  }
  await React.act(render)
  assert.equal(document.querySelector('select'), null)
  for (const group of ['Eyebrows', 'Mouth', 'Motion']) {
    assert.ok(document.querySelector(`#studio-left [role="radiogroup"][aria-label="${group}"]`))
    assert.equal(document.querySelector(`#studio-right [role="radiogroup"][aria-label="${group}"]`), null)
  }
  assert.ok(document.querySelector('#studio-left input[type="range"]'))
  assert.ok(document.querySelector('#studio-left input[type="checkbox"]'))
  const radio = (group, label) =>
    document.querySelector(`[role="radiogroup"][aria-label="${group}"] [role="radio"][aria-label="${label}"]`)
  const preview = () => document.querySelector('img[alt="Character preview"]').src
  const initial = preview()
  await React.act(() => radio('Shape', 'Heart').click())
  assert.equal(appearance.config.shape, 'heart')
  assert.equal(appearance.config.tilt, 9)
  assert.equal(appearance.config.eyeSize, 1.3)
  assert.equal(appearance.id, 'future-character')
  assert.notEqual(preview(), initial)
  await React.act(() =>
    radio('Shape', 'Heart').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
  )
  assert.equal(appearance.config.shape, 'cloud')
  assert.equal(document.activeElement, radio('Shape', 'Cloud'))
  assert.equal(radio('Shape', 'Cloud').getAttribute('aria-checked'), 'true')
  await React.act(() => radio('Expression', 'Delighted').click())
  assert.equal(appearance.config.eyes, 'happy')
  assert.equal(appearance.config.brows, 'flat')
  await React.act(() => radio('Face ink', 'Light').click())
  assert.equal(appearance.config.ink, 'light')
  await React.act(() => radio('Motion', 'Sway').click())
  assert.equal(appearance.config.motion, 'sway')
  const colorTrigger = document.querySelector('[aria-label="Choose character color"]')
  await React.act(() => colorTrigger.dispatchEvent(new dom.window.MouseEvent('mouseover', { bubbles: true })))
  assert.equal(colorTrigger.getAttribute('aria-expanded'), 'true', 'hover opens the color flower')
  await React.act(async () => {
    colorTrigger.dispatchEvent(new dom.window.MouseEvent('mouseout', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 180))
  })
  assert.equal(colorTrigger.getAttribute('aria-expanded'), 'false', 'leaving a hover-only palette closes it')
  await React.act(() => colorTrigger.click())
  await React.act(async () => {
    colorTrigger.dispatchEvent(new dom.window.MouseEvent('mouseout', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 180))
  })
  assert.equal(
    colorTrigger.getAttribute('aria-expanded'),
    'true',
    'click keeps the palette open for touch and keyboard use'
  )
  await React.act(() => radio('Colors', '#3690f5').click())
  assert.equal(appearance.color, '#3690f5')
  assert.equal(appearance.config.motion, 'sway')
  const customColor = document.querySelector('input[type="color"]')
  assert.ok(customColor, 'the center of the wheel opens a custom color input')
  await React.act(() =>
    document
      .querySelector('[role="dialog"]')
      .dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  )
  assert.equal(colorTrigger.getAttribute('aria-expanded'), 'false')
  const saved = JSON.stringify(appearance)
  await React.act(() => radio('Preview activity', 'Thinking').click())
  assert.equal(state, 'review')
  assert.equal(JSON.stringify(appearance), saved, 'preview activity must not modify the saved appearance')
  const thinking = preview()
  await React.act(() => radio('Preview activity', 'Asleep').click())
  assert.notEqual(preview(), thinking)
  await React.act(() => {
    reduced = true
    mediaListeners.forEach((cb) => cb())
  })
  for (const image of document.querySelectorAll('img'))
    assert.ok(
      !decodeURIComponent(image.src).includes('<animate'),
      'every thumbnail and the hero respect reduced motion'
    )
})

test('shape orbit wraps continuously instead of spinning backwards through the whole catalog', () => {
  const load = rendererModules({})
  const { nearestOrbitPosition } = load('ShapeOrbit.tsx')
  assert.equal(nearestOrbitPosition(11, 0), 12)
  assert.equal(nearestOrbitPosition(0, 11), -1)
  assert.equal(nearestOrbitPosition(24, 1), 25)
})
