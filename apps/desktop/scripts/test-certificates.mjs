// Isolated TLS fixture; no account credentials or production services are used.
import assert from 'node:assert/strict'
import { spawn, fork, execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:https'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import electron from 'electron'
import { Server } from 'socket.io'
import { NAMESPACE } from '@xpert-ai/desktop-protocol'

const directory = mkdtempSync(join(tmpdir(), 'bosi-tls-test-'))
let server
let sockets
try {
  const key = join(directory, 'key.pem'),
    certificate = join(directory, 'certificate.pem')
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-keyout',
      key,
      '-out',
      certificate,
      '-subj',
      '/CN=localhost',
      '-addext',
      'subjectAltName=DNS:localhost,IP:127.0.0.1'
    ],
    { stdio: 'ignore' }
  )
  server = createServer({ key: readFileSync(key), cert: readFileSync(certificate) }, (request, response) => {
    if (request.url === '/chatkit') {
      response.setHeader('Content-Type', 'text/html')
      response.end(
        '<script>fetch("/api/ping").then(r=>r.json()).then(()=>parent.postMessage("chatkit-ready","*"))</script>'
      )
    } else {
      const user = { id: 'fixture-user', name: 'TLS fixture', tenantId: 'fixture-tenant' }
      response.setHeader('Content-Type', 'application/json')
      response.end(
        JSON.stringify(
          request.url === '/api/auth/login'
            ? { token: 'fixture-only', refreshToken: 'fixture-only', user }
            : { user, organizations: [{ id: 'fixture-org', name: 'TLS fixture' }] }
        )
      )
    }
  })
  await new Promise((resolve) => server.listen(0, resolve))
  const port = server.address().port
  sockets = new Server(server)
  sockets.of(NAMESPACE).on('connection', (socket) => {
    socket.emit('ready', { connectionEpoch: randomUUID(), leaseUntil: Date.now() + 90000 })
  })
  for (const fixture of ['connection-tls', 'connection-settings']) {
    const child = spawn(
      electron,
      [fileURLToPath(new URL(`../tests/fixtures/${fixture}.electron.cjs`, import.meta.url))],
      {
        stdio: 'inherit',
        env: {
          ...process.env,
          BOSI_TLS_TEST_PROFILE: join(directory, fixture),
          BOSI_TLS_TEST_URL: `https://127.0.0.1:${port}`
        }
      }
    )
    const timer = setTimeout(() => child.kill('SIGKILL'), 60000)
    try {
      const code = await new Promise((resolve, reject) => {
        child.once('error', reject)
        child.once('exit', resolve)
      })
      assert.equal(code, 0, `Electron ${fixture} acceptance failed`)
    } finally {
      clearTimeout(timer)
    }
  }
  for (const allowed of [false, true]) {
    const child = fork(fileURLToPath(new URL('../electron/shell/worker.cjs', import.meta.url)), [], {
      stdio: ['ignore', 'inherit', 'inherit', 'ipc']
    })
    const stopped = new Promise((resolve) => child.once('exit', resolve))
    const timer = setTimeout(() => child.kill('SIGKILL'), 15000)
    try {
      const status = new Promise((resolve, reject) => {
        child.on('message', (message) => {
          if (message.type === 'status') resolve(message)
        })
        child.once('error', reject)
        child.once('exit', () => reject(new Error('Shell worker exited before TLS result')))
      })
      child.send({
        type: 'start',
        directory: join(directory, `shell-${allowed}`),
        settings: {},
        url: `https://127.0.0.1:${port}`,
        token: 'fixture-only',
        allowUntrustedCertificates: allowed
      })
      assert.equal((await status).connected, allowed)
      console.log(`PASS: Desktop Shell ${allowed ? 'accepts' : 'rejects'} self-signed TLS according to policy`)
    } finally {
      if (child.connected) child.send({ type: 'stop' })
      await stopped
      clearTimeout(timer)
    }
  }
} finally {
  sockets?.close()
  server?.closeAllConnections()
  server?.close()
  rmSync(directory, { recursive: true, force: true })
}
