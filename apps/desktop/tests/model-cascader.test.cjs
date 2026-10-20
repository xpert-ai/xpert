const { test } = require('node:test')
const assert = require('node:assert/strict')
const { join } = require('node:path')
const { createRequire } = require('node:module')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { JSDOM } = require('jsdom')

// Bundle the real selector and UI primitives with one React copy, matching Vite's deduplication.
const viteRequire = createRequire(require.resolve('vite/package.json'))
const code = viteRequire('esbuild').buildSync({
  entryPoints: [join(__dirname, '../src/catalog/ModelCascader.tsx')],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  jsx: 'automatic',
  alias: {
    '@xpert-ai/shadcn-ui': join(__dirname, '../src/ui.ts'),
    '@': join(__dirname, '../../../packages/shadcn-ui/src')
  },
  external: ['react', 'react-dom', 'react/*', 'react-dom/*']
}).outputFiles[0].text
const compiled = { exports: {} }
new Function('require', 'module', 'exports', code)(require, compiled, compiled.exports)
const { ModelCascader } = compiled.exports

test('shared model selector renders custom accessible labels, metadata and defaults while retaining Bosi title', () => {
  const model = {
    id: 'selected',
    label: 'Model',
    provider: { id: 'provider', label: 'Provider', iconUrl: 'https://api.example.com/icon.svg' },
    connectionName: 'Team connection',
    features: ['vision', 'tool-call'],
    contextWindow: 128000
  }
  const render = (props) =>
    new JSDOM(
      renderToStaticMarkup(
        React.createElement(ModelCascader, {
          id: 'embedding',
          models: [model],
          value: model.id,
          onChange() {},
          ...props
        })
      )
    )
  const dom = render({ label: 'Knowledge embedding model', defaultModelId: 'selected', disabled: true })
  const document = dom.window.document
  assert.equal(document.querySelector('label').textContent, 'Knowledge embedding model')
  const trigger = document.getElementById('embedding')
  assert.equal(trigger.getAttribute('aria-labelledby'), 'embedding-label embedding-value')
  assert.equal(trigger.disabled, true)
  assert.equal(trigger.querySelector('img').getAttribute('src'), model.provider.iconUrl)
  assert.equal(trigger.querySelector('img').getAttribute('alt'), '')
  for (const text of ['Provider / Team connection', '128K context', 'Vision', 'Tool calling', 'Default model'])
    assert.ok(trigger.textContent.includes(text), text)
  dom.window.close()
  const bosi = render({})
  assert.equal(bosi.window.document.querySelector('label').textContent, 'Model')
  bosi.window.close()
})
