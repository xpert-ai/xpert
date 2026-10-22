// Probe the actual jail and both interpreters before advertising the Compute binding.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

assert.equal(process.getuid(), 10001)
assert.equal(process.env.XPERT_NSJAIL_RUNNER_TOKEN, undefined)
const status = readFileSync('/proc/self/status', 'utf8')
assert.match(status, /NoNewPrivs:\s+1/)
assert.match(status, /CapEff:\s+0+\n/)
for (const file of [
  '/etc/compute-probe',
  '/workspace/input/probe',
  '/workspace/runtime/probe',
  '/workspace/invocations/probe'
]) {
  assert.throws(() => writeFileSync(file, 'forbidden'))
}
writeFileSync('/workspace/output/probe', 'ok')
execFileSync('node', ['/opt/xpert/sandbox-runtime/compute-smoke.mjs'], { timeout: 5000 })
execFileSync(
  'python3',
  [
    '-I',
    '-c',
    `
import socket, os
for path in ['/', '/workspace/input', '/workspace/runtime', '/workspace/invocations']:
    assert os.statvfs(path).f_flag & os.ST_RDONLY
for address in ['127.0.0.1', '1.1.1.1', '169.254.169.254']:
    sock = socket.socket()
    sock.settimeout(0.1)
    assert sock.connect_ex((address, 80)) != 0
    sock.close()
`
  ],
  { timeout: 2000 }
)
process.stdout.write(
  execFileSync('node', ['/opt/xpert/sandbox-runtime/runner-host.mjs', '--manifest'], { timeout: 5000 })
)
