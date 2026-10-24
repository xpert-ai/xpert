const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { runInNewContext } = require('node:vm')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { JSDOM } = require('jsdom')
const urls = require('../electron/connection/urls.mjs')
const { DesktopService } = require('../electron/service.cjs')

function connectionForm(defaults) {
  const exports = {}
  let checked
  const imports = {
    'react/jsx-runtime': require('react/jsx-runtime'),
    './i18n': { t: (key) => key },
    '../electron/connection/urls.mjs': urls,
    '@xpert-ai/shadcn-ui': { Input: 'input', Label: 'label', Switch: () => null },
    './connection/ConnectionCertificates': {
      ConnectionCertificates: ({ draft }) => {
        checked = draft
        return null
      }
    }
  }
  runInNewContext(
    ts.transpileModule(readFileSync(join(__dirname, '../src/ConnectionFields.tsx'), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
    }).outputText,
    { exports, require: (id) => imports[id], window: {} }
  )
  const service = new DesktopService({ defaultConfig: defaults })
  let draft = { ...service.config, apiUrl: '', webUrl: '', frameUrl: '' }
  const tree = () =>
    exports.ConnectionFields({
      draft,
      defaults,
      onChange: (value) => {
        draft = value
      }
    })
  function find(node, id) {
    if (!React.isValidElement(node)) return null
    if (node.props.id === id) return node
    for (const child of React.Children.toArray(node.props.children)) {
      const match = find(child, id)
      if (match) return match
    }
    return null
  }
  return {
    service,
    change(id, value) {
      find(tree(), id).props.onChange({ target: { value } })
    },
    render() {
      const dom = new JSDOM(renderToStaticMarkup(React.createElement('form', null, tree())))
      const form = dom.window.document.querySelector('form')
      const fields = Object.fromEntries(
        [...form.querySelectorAll('input')].map((input) => [input.id, input.placeholder])
      )
      const valid = form.checkValidity()
      dom.window.close()
      return { valid, fields, checked }
    },
    save() {
      return service.configure(draft).config
    }
  }
}

test('blank service form accepts and saves the displayed customer defaults', () => {
  const defaults = {
    apiUrl: 'https://customer.test/api',
    webUrl: 'https://customer.test/suite',
    frameUrl: 'https://customer.test/suite/chatkit'
  }
  const form = connectionForm(defaults)
  const rendered = form.render()
  assert.equal(rendered.valid, true)
  for (const [field, id] of [
    ['apiUrl', 'api-url'],
    ['webUrl', 'web-url'],
    ['frameUrl', 'frame-url']
  ]) {
    assert.equal(rendered.fields[id], defaults[field])
    assert.equal(rendered.checked[field], defaults[field])
    assert.equal(form.save()[field], defaults[field])
  }
})

test('Web edits and clearing fields derive ChatKit without a relative /chatkit URL', () => {
  const form = connectionForm({
    apiUrl: 'https://customer.test/api',
    webUrl: 'https://customer.test',
    frameUrl: 'https://customer.test/chatkit'
  })
  form.change('web-url', 'https://other.test/base/')
  assert.equal(form.render().fields['frame-url'], 'https://other.test/base/chatkit')
  assert.equal(form.save().frameUrl, 'https://other.test/base/chatkit')
  form.change('frame-url', 'https://other.test/base/chatkit')
  form.change('web-url', '')
  assert.equal(form.save().frameUrl, 'https://customer.test/chatkit')
  form.change('frame-url', 'https://chat.test/custom')
  form.change('web-url', 'https://new.test')
  assert.equal(form.save().frameUrl, 'https://chat.test/custom')
  form.change('frame-url', '')
  assert.equal(form.save().frameUrl, 'https://new.test/chatkit')
  form.change('api-url', 'not-a-url')
  assert.equal(form.render().valid, false)
})
