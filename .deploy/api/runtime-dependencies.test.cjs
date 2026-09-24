const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const path = require('node:path')
const { test } = require('node:test')

const root = path.resolve(__dirname, '../..')
const manifests = ['.deploy/api/package.json', '.deploy/api/package-prod.json', 'packages/server-ai/package.json']

for (const manifestPath of manifests) {
  test(`${manifestPath} shares the ChatKit catalog with the API image`, () => {
    const manifest = JSON.parse(readFileSync(path.join(root, manifestPath), 'utf8'))
    assert.equal(manifest.dependencies['@xpert-ai/chatkit-types'], 'catalog:')
  })
}

function verify(t, exports) {
  const cwd = mkdtempSync(path.join(tmpdir(), 'api-runtime-dependencies-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  if (exports !== null) {
    const packageDir = path.join(cwd, 'node_modules/@xpert-ai/chatkit-types')
    mkdirSync(packageDir, { recursive: true })
    writeFileSync(path.join(packageDir, 'index.js'), exports)
  }
  return spawnSync(process.execPath, [path.join(__dirname, 'verify-runtime-dependencies.cjs')], {
    cwd,
    encoding: 'utf8'
  })
}

test('the image check resolves compatible runtime exports from the API directory', (t) => {
  const result = verify(
    t,
    `module.exports = {
    getMessageSkillUsages() {}, normalizeChatSkillUsages() {}, normalizeThreadReference() {}
  }`
  )
  assert.equal(result.status, 0, result.stderr)
})

test('the image check rejects the old runtime with missing ChatKit functions', (t) => {
  const result = verify(t, 'module.exports = {}')
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /missing getMessageSkillUsages, normalizeChatSkillUsages, normalizeThreadReference/)
})

test('the image check rejects non-callable runtime exports', (t) => {
  const result = verify(
    t,
    `module.exports = {
    getMessageSkillUsages: true, normalizeChatSkillUsages() {}, normalizeThreadReference() {}
  }`
  )
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /missing getMessageSkillUsages/)
})

test('the image check rejects a missing runtime package', (t) => {
  const result = verify(t, null)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Cannot find module '@xpert-ai\/chatkit-types'/)
})
