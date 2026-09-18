import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
const suite = new URL('../', import.meta.url)
test('OCR backend applies job confidence settings before serving requests', () => {
  execFileSync('python3', [new URL('images/document-java/tests/hybrid-backend.test.py', suite).pathname], {
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    timeout: 10000
  })
})
test('OCR dependencies and model weights are pinned for offline execution', async () => {
  const family = new URL('images/document-java/', suite)
  const lock = JSON.parse(await readFile(new URL('dependencies.lock.json', family)))
  const catalog = JSON.parse(await readFile(new URL('models.lock.json', family)))
  assert.deepEqual(lock.ocr.languages, ['ch_sim', 'en'])
  for (const file of catalog.files) {
    assert.match(file.url, /^https:\/\//)
    assert.match(file.sha256, /^[a-f0-9]{64}$/)
    assert.match(file.downloadSha256, /^[a-f0-9]{64}$/)
    assert.ok(Number.isSafeInteger(file.size) && file.size > 0)
    assert.ok(!file.path.split('/').some((part) => !part || part === '.' || part === '..'))
  }
  assert.ok(catalog.files.some((file) => file.path === 'EasyOcr/zh_sim_g2.pth'))
  assert.ok(catalog.files.some((file) => file.path === 'EasyOcr/craft_mlt_25k.pth'))
})
for (const family of ['document-node', 'document-java'])
  test(`${family} pins dependencies and production isolation`, async () => {
    const image = JSON.parse(await readFile(new URL(`images/${family}/image.json`, suite)))
    const manifest = JSON.parse(await readFile(new URL(image.manifest, suite)))
    const lock = await readFile(new URL(image.dependenciesLock, suite))
    const definition = JSON.parse(await readFile(new URL(image.runtimeDefinition, suite)))
    assert.equal(createHash('sha256').update(lock).digest('hex'), manifest.dependenciesSha256)
    assert.deepEqual(definition.expectedManifest, manifest)
    assert.equal(definition.networkPolicy.mode, 'none')
    assert.equal(definition.security.runAsNonRoot, true)
    assert.equal(definition.security.readOnlyRootFilesystem, true)
    const dockerfile = await readFile(new URL(image.dockerfile, suite), 'utf8')
    assert.match(dockerfile, /COPY packages\/sandbox-runtime\//)
    assert.match(dockerfile, /USER 10001:10001/)
  })
test('release matrix produces valid tags for all Runtime families', () => {
  const matrix = JSON.parse(
    execFileSync(process.execPath, [new URL('scripts/build-matrix.mjs', suite).pathname], { encoding: 'utf8' })
  )
  for (const item of matrix.include) assert.doesNotMatch(item.versionTag, /undefined|null/)
  for (const name of ['document-node', 'document-java'])
    assert.equal(matrix.include.filter((item) => item.family === name).length, 1)
})
