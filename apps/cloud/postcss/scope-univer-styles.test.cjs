const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const postcss = require('postcss')
const scopeUniverStyles = require('./scope-univer-styles.cjs')

const univerStylesheetPath = path.join(process.cwd(), 'node_modules/@univerjs/preset-sheets-core/lib/index.css')

test('scopes and layers Univer rules while namespacing generic keyframes', async () => {
  const input = [
    '*{--univer-tw-translate-x:0}',
    '.univer-animate-in{animation-name:enter}',
    '.univer-animate-out{animation:150ms ease exit}',
    '@keyframes enter{from{opacity:0}}',
    '@keyframes exit{to{opacity:0}}'
  ].join('')
  const result = await postcss([scopeUniverStyles()]).process(input, { from: univerStylesheetPath })

  assert.match(result.css, /^@layer vendor\{/)
  assert.match(result.css, /:where\([^)]*\[data-u-comp\][^)]*\[class\*="univer-"\][^)]*\) \*/)
  assert.match(result.css, /:where\([^)]*\[class\*="univer-"\][^)]*\)\.univer-animate-in/)
  assert.match(result.css, /animation-name:xp-univer-enter/)
  assert.match(result.css, /animation:150ms ease xp-univer-exit/)
  assert.match(result.css, /@keyframes xp-univer-enter/)
  assert.match(result.css, /@keyframes xp-univer-exit/)
  assert.doesNotMatch(result.css, /@keyframes (enter|exit)/)
})

test('leaves non-Univer stylesheets unchanged', async () => {
  const input = '.example{animation-name:enter}'
  const result = await postcss([scopeUniverStyles()]).process(input, {
    from: path.join(process.cwd(), 'apps/cloud/src/styles.css')
  })

  assert.equal(result.css, input)
})
