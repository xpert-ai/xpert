// Isolated fixture preview; no real credentials, API calls or production bundle entry.
import { createServer } from 'vite'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const { DesktopService } = require('../electron/service.cjs')
const { dispatch } = require('../electron/dispatch.cjs')
const { usageFixture, organizationId } = require('../tests/fixtures/usage.cjs')
const root = fileURLToPath(new URL('..', import.meta.url))
let scenario = 'populated'
const service = new DesktopService({
  fetcher: async (url) => {
    if (scenario === 'forbidden') return new Response('{}', { status: 403 })
    if (scenario === 'unavailable') return new Response('{}', { status: 404 })
    return new Response(JSON.stringify(usageFixture(url, scenario)))
  }
})
service.credentials = { token: 'fixture-only', tenantId: 'fixture-tenant', organizationId }
service.profile = { user: { id: 'fixture-user' }, organizationId, organizations: [{ id: organizationId }] }
const server = await createServer({
  root,
  configFile: `${root}/vite.config.mjs`,
  server: { host: '127.0.0.1', port: 4396, strictPort: true },
  plugins: [
    {
      name: 'isolated-usage-fixture',
      enforce: 'pre',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (!['/__desktop', '/__usage-scenario'].includes(req.url)) return next()
          if (
            req.method !== 'POST' ||
            req.headers.host !== '127.0.0.1:4396' ||
            req.headers.origin !== 'http://127.0.0.1:4396'
          )
            return res.writeHead(403).end()
          let body = ''
          for await (const chunk of req) {
            body += chunk
            if (body.length > 16384) return res.writeHead(400).end()
          }
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'no-store')
          if (req.url === '/__usage-scenario') {
            if (!['populated', 'empty', 'forbidden', 'unavailable', 'unlimited', 'no-plan'].includes(body))
              return res.writeHead(400).end()
            scenario = body
            return res.end('{}')
          }
          try {
            const { method, argument } = JSON.parse(body)
            if (
              !['usageMembership', 'usagePeriods', 'usageOverview', 'usageSummaries', 'usageEntries'].includes(method)
            )
              return res.writeHead(403).end()
            res.end(JSON.stringify(await dispatch(service, method, argument)))
          } catch {
            res.writeHead(400).end('{}')
          }
        })
      }
    }
  ]
})
await server.listen()
console.log('Usage fixture preview: http://127.0.0.1:4396/tests/fixtures/usage-preview.html')
