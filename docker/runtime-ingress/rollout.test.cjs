// Run with: node --test docker/runtime-ingress/rollout.test.cjs (Docker required).
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { execFileSync } = require('node:child_process')
const { randomUUID } = require('node:crypto')
const ts = require('typescript')
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const docker = (...args) =>
  execFileSync('docker', args, { encoding: 'utf8', timeout: 45000, stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const request = (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(3000) })
async function until(check, label, timeout = 20000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      if (await check()) return
    } catch {}
    await sleep(200)
  }
  throw new Error('Timed out: ' + label)
}
test(
  'three replicas behind Nginx and readiness ingress survive consecutive rolls and recovery',
  { timeout: 180000 },
  async (t) => {
    const root = path.resolve(__dirname, '../..')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xpert-1207-'))
    const network = 'xpert-1207-' + randomUUID().slice(0, 8)
    const containers = []
    let pumping = false
    let pump
    let stream
    t.after(async () => {
      pumping = false
      await pump?.catch(() => {})
      await stream?.cancel().catch(() => {})
      for (const name of containers.reverse()) {
        try {
          docker('rm', '-f', name)
        } catch {}
      }
      try {
        docker('network', 'rm', network)
      } catch {}
      fs.rmSync(dir, { recursive: true, force: true })
    })
    const sources = {}
    for (const name of ['runtime-lifecycle.service', 'runtime-drain.middleware', 'runtime-traffic-withdrawal']) {
      sources[name] = ts.transpileModule(
        fs.readFileSync(path.join(root, 'packages/server/src/runtime-control', name + '.ts'), 'utf8'),
        {
          compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
            experimentalDecorators: true
          }
        }
      ).outputText
    }
    fs.writeFileSync(path.join(dir, 'sources.json'), JSON.stringify(sources))
    fs.copyFileSync(path.join(__dirname, 'fixture.cjs'), path.join(dir, 'fixture.cjs'))
    fs.writeFileSync(
      path.join(dir, 'nginx.conf'),
      `events {}\nhttp { server { listen 8080; location / { proxy_pass http://api-ingress:3000; proxy_http_version 1.1; proxy_buffering off; proxy_read_timeout 120s; } } }`
    )
    docker('network', 'create', network)
    function start(id, aliases, mounts, image, command) {
      const name = network + '-' + id
      const args = ['run', '-d', '--name', name, '--network', network, '-p', '127.0.0.1::3000', '-e', 'TEST_NODE=' + id]
      for (const alias of aliases) args.push('--network-alias', alias)
      for (const mount of mounts) args.push('-v', mount)
      containers.push(name)
      docker(...args, image, ...command)
      return name
    }
    const addresses = []
    for (let i = 0; i < 3; i++) {
      const name = start('api' + i, ['api'], [dir + ':/fixture'], 'node:22-bookworm', [
        'sh',
        '-c',
        'while true; do node /fixture/fixture.cjs; sleep 0.5; done'
      ])
      addresses.push('http://' + docker('port', name, '3000/tcp'))
    }
    const proxy = start(
      'ingress',
      ['api-ingress'],
      [path.join(__dirname, 'haproxy.cfg') + ':/usr/local/etc/haproxy/haproxy.cfg:ro'],
      process.env.XPERT_INGRESS_IMAGE || 'haproxy:3.2.26-alpine',
      []
    )
    const nginx = network + '-nginx'
    containers.push(nginx)
    docker(
      'run',
      '-d',
      '--name',
      nginx,
      '--network',
      network,
      '-p',
      '127.0.0.1::8080',
      '-v',
      dir + '/nginx.conf:/etc/nginx/nginx.conf:ro',
      'nginx:1.30.6'
    )
    const origin = 'http://' + docker('port', nginx, '8080/tcp')
    const status = async (i) => (await request(addresses[i] + '/__test/status')).json()
    const seen = new Set()
    await until(async () => {
      const response = await request(origin + '/api/list')
      if (!response.ok) return false
      seen.add((await response.json()).node)
      return seen.size === 3
    }, 'all three replicas admitted')
    stream = (await fetch(origin + '/api/events')).body.getReader()
    const first = await stream.read()
    const streamNode = JSON.parse(new TextDecoder().decode(first.value).split('data: ')[1].split('\n')[0]).node
    const streamIndex = Number(streamNode.slice(3))
    const failures = []
    let sent = 0
    pumping = true
    pump = (async () => {
      while (pumping) {
        for (const [method, url] of [
          ['GET', '/api/list'],
          ['POST', '/api/ai/v1/chatkit/sessions'],
          ['POST', '/api/chat']
        ]) {
          const id = 'request-' + ++sent
          try {
            const response = await request(origin + url, { method, headers: { 'x-test-request': id } })
            if (response.status !== 200) failures.push({ id, status: response.status })
            else assert.equal((await response.json()).id, id)
          } catch (error) {
            failures.push({ id, error: error.message })
          }
        }
        await sleep(100)
      }
    })()
    // First drain preserves an existing SSE while new requests move to peers.
    const previous = await status(streamIndex)
    await request(addresses[streamIndex] + '/__test/withdraw', { method: 'POST' })
    await until(async () => (await status(streamIndex)).status === 'draining', 'drain entered')
    assert.equal((await status(streamIndex)).activeRequests, 1)
    assert.equal((await stream.read()).done, false)
    await stream.cancel()
    stream = undefined
    await until(async () => {
      const s = await status(streamIndex)
      return s.status === 'ready' && s.bootId !== previous.bootId
    }, 'replacement listening')
    await sleep(3500)
    // Complete two sequential rolling passes, maintaining the same container/DNS identities.
    for (const i of [...[0, 1, 2].filter((i) => i !== streamIndex), 0, 1, 2]) {
      const before = await status(i)
      await request(addresses[i] + '/__test/withdraw', { method: 'POST' })
      await until(async () => {
        const s = await status(i)
        return s.status === 'ready' && s.bootId !== before.bootId
      }, 'replacement ' + i)
      await sleep(3500)
    }
    // A cancelled withdrawal is readmitted without restarting the process.
    const before = await status(0)
    await request(addresses[0] + '/__test/withdraw', { method: 'POST' })
    await sleep(1500)
    await request(addresses[0] + '/__test/cancel', { method: 'POST' })
    await until(async () => (await status(0)).status === 'ready', 'cancelled withdrawal recovered')
    assert.equal((await status(0)).bootId, before.bootId)
    pumping = false
    await pump
    assert.deepEqual(failures, [], JSON.stringify(failures))
    const receipts = addresses.flatMap((_, i) =>
      fs
        .readFileSync(path.join(dir, 'receipts-api' + i), 'utf8')
        .trim()
        .split('\n')
    )
    assert.equal(new Set(receipts).size, receipts.length, 'no POST replay')
    // With every instance fenced, only authenticated recovery routes remain reachable.
    for (const address of addresses) await request(address + '/__test/unready', { method: 'POST' })
    await sleep(2500)
    const unavailable = await request(origin + '/api/list')
    assert.equal(unavailable.status, 503)
    assert.equal(unavailable.headers.get('retry-after'), '5')
    assert.equal((await unavailable.json()).errorCode, 'RUNTIME_NOT_READY')
    assert.equal((await request(origin + '/api/plugin/refresh', { method: 'POST' })).status, 401)
    assert.equal(
      (await request(origin + '/api/plugin/refresh', { method: 'POST', headers: { authorization: 'Bearer test' } }))
        .status,
      200
    )
    for (const address of addresses) await request(address + '/__test/ready', { method: 'POST' })
    await until(async () => (await request(origin + '/api/list')).status === 200, 'recovery readmission')
    t.diagnostic(`${sent} requests, two rolling passes, SSE preserved, no 503 during rolls, no duplicate POSTs`)
  }
)
