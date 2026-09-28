const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync, existsSync } = require('node:fs')
const { join, dirname, resolve, extname } = require('node:path')
const { runInNewContext } = require('node:vm')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const ts = require('typescript')

const cache = new Map()
function load(file) {
  if (cache.has(file)) return cache.get(file)
  const output = {}
  cache.set(file, output)
  runInNewContext(
    ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true
      }
    }).outputText,
    {
      exports: output,
      require: (name) => {
        if (!name.startsWith('.')) return require(name)
        const path = resolve(dirname(file), name)
        if (extname(path) === '.json') return require(path)
        return load(['.ts', '.tsx'].map((extension) => path + extension).find(existsSync))
      }
    }
  )
  return output
}
const { BotAvatar } = load(join(__dirname, '../src/avatar/BotAvatar.tsx'))
const bot = { id: 'assistant-expression', name: 'Assistant' }
const render = (status, overrides = {}) =>
  renderToStaticMarkup(React.createElement(BotAvatar, { bot: { ...bot, ...overrides }, status }))

test('fallback avatar renders distinct expressions for every supported latest-conversation state', () => {
  const faces = ['idle', 'busy', 'pausing', 'paused', 'interrupted', 'error'].map((status) => render(status))
  assert.equal(new Set(faces.map((face) => face.match(/data-expression="([^"]+)"/)[1])).size, 6)
  for (const face of faces) {
    for (const part of ['left-eye', 'right-eye', 'mouth']) assert.ok(face.includes(`data-face-part="${part}"`))
  }
  assert.match(render('error'), /data-expression="dejected"/)
  assert.match(render('error'), /d="M39 78 Q50 63 61 78"/, 'the failed state has a restrained 15-unit mouth bend')
  assert.match(render('interrupted'), /data-expression="questioning"/)
})

test('cleared status returns to the original smile without changing the stable avatar color', () => {
  const idle = render('idle')
  assert.equal(render(undefined), idle)
  assert.equal(render(null), idle)
  assert.equal(render('error').match(/style="([^"]+)"/)[1], idle.match(/style="([^"]+)"/)[1])
})

test('conversation status never replaces a custom image or emoji with the default expression', () => {
  for (const overrides of [
    { avatarUrl: 'https://example.test/avatar.png' },
    { avatarEmoji: { id: 'smile', unified: '1f600' } }
  ]) {
    assert.equal(render('error', overrides), render('idle', overrides))
    assert.ok(!render('error', overrides).includes('data-assistant-mascot'))
  }
})
