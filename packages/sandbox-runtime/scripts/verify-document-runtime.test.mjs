import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, readFile, rm, truncate } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const verifier = new URL('./verify-document-runtime.mjs', import.meta.url)
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'document-health-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const put = async (file, value, executable = false) => {
    const target = path.join(root, file)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, value, executable ? { mode: 0o755 } : undefined)
  }
  await put(
    'jre/bin/java',
    '#!/bin/sh\nif [ "$1" = "-version" ]; then exit 0; fi\nprintf conversion > "$PWD/unused"\nwhile [ "$#" -gt 0 ]; do\nif [ "$1" = "--output-dir" ]; then shift; printf RUNTIME_HEALTH > "$1/health.md"; exit 0; fi\nshift\ndone\nexit 1\n',
    true
  )
  // The stand-ins expose invocation errors without requiring Java, Python or model downloads in unit tests.
  await put(
    'python/bin/python3',
    '#!/bin/sh\ncase "$3" in\n*metadata*) printf \'["3.12.10","2.5.8","2.127.0"]\';;\n*) printf cpu >> "' +
      root +
      '/calls";;\nesac\n',
    true
  )
  await put('jre/release', 'JAVA_VERSION="17.0.16"')
  await put('cli/tool.jar', 'fake-jar')
  await put('requirements.txt', 'pinned')
  await put('hybrid-backend.py', 'backend')
  await put('models/weights.bin', 'good')
  const models = JSON.stringify({ files: [{ path: 'weights.bin', size: 4, sha256: sha('good') }] })
  await put('models.lock.json', models)
  const lock = JSON.stringify({
    javaVersion: '17.0.16',
    cli: { jar: 'tool.jar', version: '2.5.8', jarSha256: sha('fake-jar') },
    ocr: {
      pythonVersion: '3.12.10',
      opendataloaderVersion: '2.5.8',
      doclingVersion: '2.127.0',
      requirementsSha256: sha('pinned'),
      backendSha256: sha('backend'),
      modelsSha256: sha(models)
    }
  })
  await put('dependencies.lock.json', lock)
  await put(
    'manifest.json',
    JSON.stringify({
      imageFamily: 'document-java',
      nodeVersion: process.versions.node,
      javaVersion: '17.0.16',
      opendataloaderVersion: '2.5.8',
      dependenciesSha256: sha(lock)
    })
  )
  return {
    root,
    put,
    run: (mode) =>
      spawnSync(
        process.execPath,
        [verifier.pathname, path.join(root, 'manifest.json'), path.join(root, 'dependencies.lock.json'), root, ...mode],
        { cwd: root, encoding: 'utf8', timeout: 10000 }
      )
  }
}

test('readiness avoids a full conversion but still executes the OCR CPU probe', async (t) => {
  const f = await fixture(t)
  const result = f.run(['--readiness'])
  assert.equal(result.status, 0, result.stderr)
  assert.equal(await readFile(path.join(f.root, 'calls'), 'utf8'), 'cpu')
  await assert.rejects(readFile(path.join(f.root, 'unused')), { code: 'ENOENT' })
})

test('the default installation check still converts a document', async (t) => {
  const f = await fixture(t)
  const result = f.run([])
  assert.equal(result.status, 0, result.stderr)
  assert.equal(await readFile(path.join(f.root, 'unused'), 'utf8'), 'conversion')
})

test('full verification hashes model bytes; readiness checks their presence and size', async (t) => {
  const f = await fixture(t)
  await f.put('models/weights.bin', 'evil')
  assert.equal(f.run(['--readiness']).status, 0)
  const full = f.run([])
  assert.notEqual(full.status, 0)
  assert.match(full.stderr, /OCR model missing or invalid/)
  await truncate(path.join(f.root, 'models/weights.bin'), 1)
  assert.notEqual(f.run(['--readiness']).status, 0)
  await rm(path.join(f.root, 'models/weights.bin'))
  assert.notEqual(f.run(['--readiness']).status, 0)
})

test('readiness rejects a broken OCR executable instead of declaring the runtime healthy', async (t) => {
  const f = await fixture(t)
  await f.put(
    'python/bin/python3',
    '#!/bin/sh\ncase "$3" in\n*metadata*) printf \'["3.12.10","2.5.8","2.127.0"]\';;\n*) echo OCR_CPU_FAILED >&2; exit 7;;\nesac\n',
    true
  )
  const result = f.run(['--readiness'])
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /OCR_CPU_FAILED/)
})
