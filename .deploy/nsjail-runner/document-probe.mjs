// Readiness must prove the real isolated native/Java dependencies, not just a version label.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import net from 'node:net'

assert.equal(process.getuid(), 10001)
assert.equal(process.env.XPERT_NSJAIL_RUNNER_TOKEN, undefined)
const status = readFileSync('/proc/self/status', 'utf8')
assert.match(status, /NoNewPrivs:\s+1/)
assert.match(status, /CapEff:\s+0+\n/)
for (const file of [
  '/etc/probe',
  '/workspace/input/probe',
  '/workspace/runtime/probe',
  '/workspace/invocations/probe'
]) {
  assert.throws(() => writeFileSync(file, 'forbidden'))
}
writeFileSync('/workspace/output/probe', 'ok')
for (const host of ['1.1.1.1', '169.254.169.254']) {
  await new Promise((resolve, reject) => {
    const socket = net.connect({ host, port: 80 })
    socket.setTimeout(200)
    socket.once('connect', () => {
      socket.destroy()
      reject(new Error('Document Runtime allowed network egress'))
    })
    socket.once('error', () => {
      socket.destroy()
      resolve()
    })
    socket.once('timeout', () => {
      socket.destroy()
      resolve()
    })
  })
}
const manifest = JSON.parse(readFileSync('/opt/xpert/sandbox-runtime/manifest.json', 'utf8'))
execFileSync(
  'node',
  manifest.profileName === 'document/libreoffice-v1'
    ? ['/opt/xpert/sandbox-runtime/verify-document-preview.mjs']
    : [
        '/opt/xpert/sandbox-runtime/verify-document-runtime.mjs',
        '/opt/xpert/sandbox-runtime/manifest.json',
        '/opt/xpert/sandbox-runtime/dependencies.lock.json',
        '/opt/xpert/document-dependencies',
        '--readiness'
      ],
  { timeout: 55000, stdio: ['ignore', 'pipe', 'pipe'] }
)
process.stdout.write(execFileSync('node', ['/opt/xpert/sandbox-runtime/runner-host.mjs', '--manifest']))
