import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const familyRoot = new URL('../', import.meta.url)
const suiteRoot = new URL('../../../', import.meta.url)
const manifest = JSON.parse(await readFile(new URL('runtime/manifest.json', familyRoot), 'utf8'))
const runner = await readFile(new URL('images/browser/runtime/runner-host.mjs', suiteRoot))

assert.equal(manifest.imageFamily, 'document')
assert.equal(manifest.profileName, 'document/libreoffice-v1')
assert.equal(manifest.nodeVersion, '20.20.2')
assert.equal(manifest.libreOfficeMajorVersion, '7')
assert.equal(manifest.runnerHostSha256, createHash('sha256').update(runner).digest('hex'))
assert.ok(!/bid|tender|proposal/i.test(JSON.stringify(manifest)))

const isolatedRuntimeRoot = await mkdtemp(path.join(tmpdir(), 'xpert-document-runtime-'))
try {
  const isolatedRunnerPath = path.join(isolatedRuntimeRoot, 'runner-host.mjs')
  const isolatedManifestPath = path.join(isolatedRuntimeRoot, 'manifest.json')
  const actionManifestPath = path.join(isolatedRuntimeRoot, 'action.json')
  const actionPath = path.join(isolatedRuntimeRoot, 'action.mjs')
  const requestPath = path.join(isolatedRuntimeRoot, 'request.json')
  const outputPath = path.join(isolatedRuntimeRoot, 'output.json')
  await Promise.all([
    writeFile(isolatedRunnerPath, runner),
    writeFile(isolatedManifestPath, `${JSON.stringify(manifest)}\n`),
    writeFile(
      actionManifestPath,
      `${JSON.stringify({ runtimeContractVersion: '1', name: 'document-smoke', version: '1.0.0', entrypoint: 'action.mjs' })}\n`
    ),
    writeFile(
      actionPath,
      "import { writeFile } from 'node:fs/promises'\nconst output = process.argv[process.argv.indexOf('--output') + 1]\nawait writeFile(output, '{\"ok\":true}\\n')\n"
    ),
    writeFile(requestPath, '{}\n')
  ])
  const execute = promisify(execFile)
  const { stdout } = await execute(process.execPath, [isolatedRunnerPath, '--manifest'], {
    env: { ...process.env, XPERT_SANDBOX_RUNTIME_MANIFEST_PATH: isolatedManifestPath }
  })
  const runtimeManifest = JSON.parse(stdout)
  assert.equal(runtimeManifest.imageFamily, 'document')
  assert.equal(runtimeManifest.playwrightVersion, undefined)
  assert.equal(runtimeManifest.browserRevision, undefined)
  await execute(
    process.execPath,
    [
      isolatedRunnerPath,
      '--request',
      requestPath,
      '--output',
      outputPath,
      '--action-root',
      isolatedRuntimeRoot,
      '--action-manifest',
      actionManifestPath
    ],
    { env: { ...process.env, XPERT_SANDBOX_RUNTIME_MANIFEST_PATH: isolatedManifestPath } }
  )
  assert.deepEqual(JSON.parse(await readFile(outputPath, 'utf8')), { ok: true })
} finally {
  await rm(isolatedRuntimeRoot, { recursive: true, force: true })
}
process.stdout.write('sandbox document runtime contract verified\n')
