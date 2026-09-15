import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { test } from 'node:test'

const family = new URL('../', import.meta.url)
const suite = new URL('../../../', import.meta.url)
const json = async (url) => JSON.parse(await readFile(url, 'utf8'))
test('pins the Python parser image, offline profile and exact dependency lock together', async () => {
  const manifest = await json(new URL('runtime/manifest.json', family))
  const image = await json(new URL('image.json', family))
  const definition = await json(new URL(image.runtimeDefinition, suite))
  const requirements = await readFile(new URL('requirements.txt', family))
  assert.equal(manifest.pythonVersion, '3.12.10')
  assert.equal(manifest.markitdownVersion, '0.1.7')
  assert.equal(manifest.requirementsSha256, createHash('sha256').update(requirements).digest('hex'))
  assert.deepEqual(definition.expectedManifest, manifest)
  assert.equal(definition.networkPolicy.mode, 'none')
  assert.equal(definition.security.readOnlyRootFilesystem, true)
  for (const base of Object.values(image.baseImages)) assert.match(base, /@sha256:[a-f0-9]{64}$/)
  const dockerfile = await readFile(new URL('Dockerfile', family), 'utf8')
  assert.match(dockerfile, /--require-hashes/)
  assert.match(dockerfile, /USER xpert/)
  assert.doesNotMatch(dockerfile, /MARKITDOWN_PYTHON/)
})
test('read-only health never installs dependencies or creates a fallback environment', async () => {
  const cache = await mkdtemp(path.join(tmpdir(), 'document-python-health-'))
  try {
    await assert.rejects(
      promisify(execFile)(
        process.execPath,
        [new URL('scripts/install-local-document-python.mjs', suite).pathname, '--verify-only'],
        {
          env: { ...process.env, XDG_CACHE_HOME: cache }
        }
      ),
      /install:document-python/
    )
    await assert.rejects(access(path.join(cache, 'xpert')), /ENOENT/)
  } finally {
    await rm(cache, { recursive: true, force: true })
  }
})
