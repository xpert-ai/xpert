import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const script = path.resolve('packages/sandbox-runtime/scripts/install-ai-resources.mjs')
const root = await mkdtemp(path.join(os.tmpdir(), 'xpert-browser-ai-installer-'))
const catalogPath = path.join(root, 'catalog.json')
const outputRoot = path.join(root, 'artifacts')
const content = Buffer.from('pinned-browser-ai-test-resource')
const digest = sha256(content)
let server

try {
  server = createServer((request, response) => {
    if (request.url !== '/model.bin') {
      response.writeHead(404).end()
      return
    }
    response.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': String(content.length) })
    response.end(content)
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const catalog = {
    version: 1,
    runtimeSuiteVersion: 'test',
    resources: [
      {
        key: 'test-model',
        type: 'model',
        path: 'models/test-model',
        treeSha256: treeSha256([{ path: 'model.bin', size: content.length, sha256: digest }]),
        files: [
          {
            path: 'model.bin',
            url: `http://127.0.0.1:${address.port}/model.bin`,
            size: content.length,
            sha256: digest
          }
        ]
      }
    ]
  }
  const catalogBytes = Buffer.from(`${JSON.stringify(catalog, null, 2)}\n`)
  await writeFile(catalogPath, catalogBytes)

  const first = await runInstaller()
  assert.equal(first.downloadedFiles, 1)
  assert.deepEqual(await readFile(path.join(outputRoot, 'catalog.json')), catalogBytes)
  assert.deepEqual(await readFile(path.join(outputRoot, 'models/test-model/model.bin')), content)

  const second = await runInstaller()
  assert.equal(second.downloadedFiles, 0)

  await writeFile(path.join(outputRoot, 'models/test-model/model.bin'), Buffer.from('corrupt'))
  await assert.rejects(() => runInstaller(['--verify-only']), /browser-ai resource is missing or corrupt/)
  const repaired = await runInstaller()
  assert.equal(repaired.downloadedFiles, 1)

  await assert.rejects(() => runInstaller(['--catalog-sha256', '0'.repeat(64)]), /resource catalog SHA-256 mismatch/)

  await new Promise((resolve) => server.close(resolve))
  server = undefined
  await rm(path.join(outputRoot, 'models/test-model/model.bin'))
  await assert.rejects(() => runInstaller(), /Unable to install pinned browser-ai resource/)
} finally {
  await new Promise((resolve) => server?.close(resolve) ?? resolve())
  await rm(root, { recursive: true, force: true })
}

async function runInstaller(extra = []) {
  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      [script, '--catalog', catalogPath, '--output', outputRoot, ...extra],
      {
        timeout: 15_000
      }
    )
    return JSON.parse(stdout.trim())
  } catch (error) {
    const message = [error?.message, error?.stdout, error?.stderr].filter(Boolean).join('\n')
    throw new Error(message)
  }
}

function treeSha256(files) {
  const hash = createHash('sha256')
  for (const file of files) hash.update(`${file.path}\0${file.size}\0${file.sha256}\n`)
  return hash.digest('hex')
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}
