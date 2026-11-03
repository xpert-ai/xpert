import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const suiteRoot = fileURLToPath(new URL('../../', import.meta.url))
const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'))
const run = (root, script, args = []) =>
  execFileSync(process.execPath, [path.join(root, 'scripts', script), ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })

test('a targeted repair publishes only the requested family and rejects unknown or missing families', () => {
  const all = JSON.parse(run(suiteRoot, 'build-matrix.mjs')).include
  const { include } = JSON.parse(run(suiteRoot, 'build-matrix.mjs', ['--family', 'compute']))
  assert.deepEqual(
    include,
    all.filter((image) => image.family === 'compute')
  )
  assert.equal(include.length, 1)
  for (const args of [['--family'], ['--family', 'unknown'], ['--family', 'compute,browser']]) {
    assert.throws(() => run(suiteRoot, 'build-matrix.mjs', args), /Unknown Runtime image family/)
  }
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
    'document-python': `${version}-py3.12.10`,
    'document-node': version,
    'document-java': version,
    compute: version
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
  suite.version = '1.2.3'
  await writeFile(file, JSON.stringify(suite))
  run(root, 'sync-version.mjs')
  run(root, 'verify-catalog.mjs')
  const { include } = JSON.parse(run(root, 'build-matrix.mjs'))
  assert.equal(include.find((image) => image.family === 'document-python').versionTag, '1.2.3-py3.12.10')
  assert.equal(include.find((image) => image.family === 'compute').versionTag, '1.2.3')
  const definition = await readJson(
    path.join(root, '../server-ai/src/sandbox/sandbox-job/runtime-definitions/document-python-3.12-v1.json')
  )
  assert.equal(definition.sandboxRuntimeVersion, '1.2.3')
  assert.equal(definition.expectedManifest.sandboxRuntimeVersion, '1.2.3')
})

async function snapshot(root) {
  const files = new Map()
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) await visit(file)
      else if (entry.isFile()) files.set(path.relative(root, file), await readFile(file))
    }
  }
  await visit(root)
  return files
}

test('synchronizing an unchanged suite preserves every file byte for release checks', async (t) => {
  const root = await fixture(t)
  const definition = path.join(
    root,
    '../server-ai/src/sandbox/sandbox-job/runtime-definitions/compute-node-python-v1.json'
  )
  // Exercise valid formatting that differs from JSON.stringify, including compact arrays.
  await writeFile(definition, `${JSON.stringify(await readJson(definition))}\n`)
  const before = await snapshot(path.dirname(root))
  run(root, 'sync-version.mjs')
  assert.deepEqual(await snapshot(path.dirname(root)), before)
  run(root, 'verify-catalog.mjs')
})

test('synchronization refreshes changed runner checksums and then becomes a no-op', async (t) => {
  const root = await fixture(t)
  const runner = path.join(root, 'images/browser/runtime/runner-host.mjs')
  const definitionFile = path.join(
    root,
    '../server-ai/src/sandbox/sandbox-job/runtime-definitions/compute-node-python-v1.json'
  )
  const before = await readJson(definitionFile)
  await writeFile(runner, `${await readFile(runner, 'utf8')}\n// Updated runner fixture.\n`)
  run(root, 'sync-version.mjs')
  const after = await readJson(definitionFile)
  assert.equal(after.sandboxRuntimeVersion, before.sandboxRuntimeVersion)
  assert.notEqual(after.expectedManifest.runnerHostSha256, before.expectedManifest.runnerHostSha256)
  run(root, 'verify-catalog.mjs')
  const synchronized = await snapshot(path.dirname(root))
  run(root, 'sync-version.mjs')
  assert.deepEqual(await snapshot(path.dirname(root)), synchronized)
})

for (const family of ['document-node', 'document-java', 'document-python']) {
  test(`${family} catalog and renderer reject a mislabeled production binding`, async (t) => {
    const root = await fixture(t)
    const file = path.join(root, 'images', family, 'artifact-catalog.template.json')
    const template = await readJson(file)
    template.artifacts[0].imageFamily = 'document'
    await writeFile(file, JSON.stringify(template))
    assert.throws(() => run(root, 'verify-catalog.mjs'), /artifact catalog identity/)
    assert.throws(
      () =>
        run(root, 'render-artifact-catalog.mjs', [
          '--family',
          family,
          '--image',
          `example.invalid/runtime@sha256:${'a'.repeat(64)}`,
          '--output',
          path.join(root, 'artifact.json')
        ]),
      /Artifact catalog identity/
    )
  })
}
