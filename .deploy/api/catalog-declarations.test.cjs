const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const root = path.resolve(__dirname, '../..')
const manifests = [
  '.deploy/api/package.json',
  '.deploy/api/package-prod.json',
  '.deploy/webapp/package.json',
  'apps/cloud/package.json',
  'apps/desktop/package.json',
  'packages/contracts/package.json',
  'packages/plugins/draft/package.json',
  'packages/server-ai/package.json'
]

for (const manifestPath of manifests) {
  test(`${manifestPath} shares the ChatKit catalog with the API image`, () => {
    const manifest = JSON.parse(readFileSync(path.join(root, manifestPath), 'utf8'))
    const references = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']
      .map((field) => manifest[field]?.['@xpert-ai/chatkit-types'])
      .filter((version) => version !== undefined)
    assert.ok(references.length, 'Expected a ChatKit dependency declaration')
    for (const version of references) assert.equal(version, 'catalog:')
  })
}
