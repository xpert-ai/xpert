// Test-only HTTP runtime: uses the production lifecycle, admission middleware and withdrawal code.
const http = require('node:http')
const fs = require('node:fs')
const vm = require('node:vm')
const { randomUUID } = require('node:crypto')
const sources = JSON.parse(fs.readFileSync('/fixture/sources.json', 'utf8'))
const cache = new Map()
function load(name) {
  if (cache.has(name)) return cache.get(name)
  const exports = {}
  cache.set(name, exports)
  vm.runInThisContext('(function(require,exports){' + sources[name] + '\n})')((id) => {
    if (id === '@nestjs/common')
      return {
        Injectable: () => (value) => value,
        Logger: class {
          log() {}
          debug() {}
          warn() {}
        }
      }
    if (id === 'i18next') return { t: (_key, options) => options.defaultValue }
    if (id === './runtime-execution-recovery') return require('/fixture/recovery.cjs')
    if (id === '../plugin/plugin-startup-state')
      return {
        isPluginStartupListening: () => ready,
        admitPluginStartup: () => true,
        canRestorePluginStartup: () => false
      }
    if (id.startsWith('./')) return load(id.slice(2))
    return require(id)
  }, exports)
  return exports
}
const { RuntimeLifecycleService } = load('runtime-lifecycle.service')
const { RuntimeDrainMiddleware } = load('runtime-drain.middleware')
const { drainRuntimeTraffic } = load('runtime-traffic-withdrawal')
const lifecycle = new RuntimeLifecycleService()
const middleware = new RuntimeDrainMiddleware(lifecycle)
const bootId = randomUUID()
let ready = false
let cancelled = false
setTimeout(() => {
  ready = true
}, 1200)
const { RuntimePluginAdmission } = load('runtime-plugin-admission')
const { RuntimeAdmissionMonitor } = load('runtime-admission-monitor')
const admission = new RuntimePluginAdmission(
  {
    isLeaseValid: () => true,
    getLeaseRemainingMs: () => 45000,
    getPluginState: () => ({ reportedAt: '', plugins: [], failures: [] }),
    setReady: async () => {}
  },
  lifecycle
)
const monitor = new RuntimeAdmissionMonitor(admission, { readDesired: async () => null }, async () => undefined)
monitor.start()
http
  .createServer(async (req, res) => {
    res.status = (code) => {
      res.statusCode = code
      return res
    }
    res.json = (value) => {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(value))
    }
    if (req.url === '/__test/install') {
      try {
        await require('/fixture/registry.cjs').installOrganizationPlugins('org-1', ['@test/slow@1.0.0'], {
          rootDir: '/fixture/plugins'
        })
        return res.json({ ok: true })
      } catch (error) {
        return res.status(500).json({ error: error.message })
      }
    }
    if (req.url === '/__test/withdraw') {
      const state = { restartId: randomUUID(), requestedAt: new Date().toISOString() }
      cancelled = false
      lifecycle.beginWithdrawal(state)
      res.json({ bootId })
      const drained = await drainRuntimeTraffic(lifecycle, state, 15000, async () => !cancelled)
      if (drained !== undefined) process.exit(0)
      return
    }
    if (req.url === '/__test/cancel') {
      cancelled = true
      return res.json({ ok: true })
    }
    if (req.url === '/__test/unready') {
      ready = false
      return res.json({ ok: true })
    }
    if (req.url === '/__test/ready') {
      ready = true
      return res.json({ ok: true })
    }
    if (req.url === '/__test/status') return res.json({ ...lifecycle.readiness(), bootId, node: process.env.TEST_NODE })
    if (req.url === '/api/health/ready') {
      res.status(lifecycle.readiness().status === 'ready' ? 200 : 503)
      return res.json(lifecycle.readiness())
    }
    middleware.use(req, res, () => {
      if (req.url === '/api/events') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
        res.write(`data: ${JSON.stringify({ node: process.env.TEST_NODE, bootId })}\n\n`)
        const timer = setInterval(() => res.write('data: heartbeat\n\n'), 200)
        res.on('close', () => clearInterval(timer))
        return
      }
      if (req.url === '/api/plugin/refresh' && req.headers.authorization !== 'Bearer test')
        return res.status(401).json({ error: 'unauthorized' })
      const id = req.headers['x-test-request']
      if (req.method === 'POST' && id) fs.appendFileSync(`/fixture/receipts-${process.env.TEST_NODE}`, id + '\n')
      return res.json({ node: process.env.TEST_NODE, bootId, id })
    })
  })
  .listen(3000, '0.0.0.0')
