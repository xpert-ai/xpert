import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (name) => readFile(new URL(name, import.meta.url), 'utf8')

test('desktop and browser pin the same published, integrity-checked spreadsheet SDK', async () => {
  const manifest = JSON.parse(await read('package.json'))
  const version = manifest.dependencies['@xpert-ai/artifact-tool']
  assert.match(version, /^\d+\.\d+\.\d+$/)
  const cloud = JSON.parse(await read('../../apps/cloud/package.json'))
  assert.equal(cloud.dependencies['@xpert-ai/artifact-tool'], version)

  const lock = JSON.parse(await read('package-lock.json'))
  assert.equal(lock.packages[''].dependencies['@xpert-ai/artifact-tool'], version)
  const sdk = lock.packages['node_modules/@xpert-ai/artifact-tool']
  assert.equal(sdk.version, version)
  assert.equal(sdk.resolved, `https://registry.npmjs.org/@xpert-ai/artifact-tool/-/artifact-tool-${version}.tgz`)
  assert.match(sdk.integrity, /^sha512-[A-Za-z0-9+/]+={0,2}$/)
  assert.equal(lock.packages['node_modules/@univerjs/core'].version, '0.25.1')
  assert.equal(lock.packages['node_modules/excelize-wasm'].version, '0.1.3')
})
