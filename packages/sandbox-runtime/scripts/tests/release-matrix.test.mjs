import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const suiteRoot = fileURLToPath(new URL('../../', import.meta.url))
const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'))
const run = (root, script) =>
  execFileSync(process.execPath, [path.join(root, 'scripts', script)], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'runtime-release-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const suite = path.join(root, 'sandbox-runtime')
  await cp(suiteRoot, suite, { recursive: true })
  await cp(
    path.join(suiteRoot, '../server-ai/src/sandbox/sandbox-job/runtime-definitions'),
    path.join(root, 'server-ai/src/sandbox/sandbox-job/runtime-definitions'),
    { recursive: true }
  )
  return suite
}

test('release matrix preserves existing tags and publishes Python with its pinned version', async () => {
  const { version } = await readJson(path.join(suiteRoot, 'package.json'))
  const { include } = JSON.parse(run(suiteRoot, 'build-matrix.mjs'))
  assert.deepEqual(Object.fromEntries(include.map((image) => [image.family, image.versionTag])), {
    browser: `${version}-pw1.61.0`,
    'browser-video': `${version}-pw1.61.0`,
    'browser-ai': `${version}-pw1.61.0`,
    document: `${version}-lo7`,
    'document-python': `${version}-py3.12.10`
  })
})

test('matrix and catalog reject a missing Python tag version', async (t) => {
  const root = await fixture(t)
  const file = path.join(root, 'images/document-python/image.json')
  const image = await readJson(file)
  delete image.pythonVersion
  await writeFile(file, JSON.stringify(image))
  for (const script of ['build-matrix.mjs', 'verify-catalog.mjs']) {
    assert.throws(() => run(root, script), /document-python.*pythonVersion/)
  }
})

test('matrix rejects an unsupported family instead of guessing its tag', async (t) => {
  const root = await fixture(t)
  const file = path.join(root, 'images/document-python/image.json')
  const image = await readJson(file)
  image.imageFamily = 'unsupported'
  await writeFile(file, JSON.stringify(image))
  assert.throws(() => run(root, 'build-matrix.mjs'), /Unsupported Runtime image family/)
})

test('catalog rejects Python image metadata that differs from the runtime manifest', async (t) => {
  const root = await fixture(t)
  const file = path.join(root, 'images/document-python/image.json')
  const image = await readJson(file)
  image.pythonVersion = '3.13.0'
  await writeFile(file, JSON.stringify(image))
  assert.throws(() => run(root, 'verify-catalog.mjs'), /Python version/)
})

test('suite patch synchronization keeps the matrix and runtime definitions aligned', async (t) => {
  const root = await fixture(t)
  const file = path.join(root, 'package.json')
  const suite = await readJson(file)
  suite.version = '1.2.2'
  await writeFile(file, JSON.stringify(suite))
  run(root, 'sync-version.mjs')
  run(root, 'verify-catalog.mjs')
  const { include } = JSON.parse(run(root, 'build-matrix.mjs'))
  assert.equal(include.find((image) => image.family === 'document-python').versionTag, '1.2.2-py3.12.10')
  const definition = await readJson(
    path.join(root, '../server-ai/src/sandbox/sandbox-job/runtime-definitions/document-python-3.12-v1.json')
  )
  assert.equal(definition.sandboxRuntimeVersion, '1.2.2')
  assert.equal(definition.expectedManifest.sandboxRuntimeVersion, '1.2.2')
})
