// Plugin HTML is served from a separate, opaque iframe origin. Never relax the desktop CSP
// or send account credentials to plugin code. Entries expire and are bound to a host session.
const { createServer } = require('node:http')
const { randomBytes } = require('node:crypto')

const entries = new Map()
let starting
function start() {
  starting ||= new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const entry = entries.get(req.url)
      if (
        req.headers.host !== `127.0.0.1:${server.address().port}` ||
        req.method !== 'GET' ||
        !entry ||
        entry.expires < Date.now() ||
        !entry.valid()
      ) {
        res.writeHead(404).end()
        return
      }
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy':
          "default-src 'none'; script-src 'unsafe-inline' blob:; style-src 'unsafe-inline'; img-src data: blob: https:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; sandbox allow-scripts allow-forms allow-downloads"
      })
      res.end(entry.html)
    })
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.unref()
      resolve(server)
    })
  }).catch((error) => {
    starting = null
    throw error
  })
  return starting
}
async function createEntry(html, valid) {
  const server = await start()
  for (const [key, entry] of entries) if (entry.expires < Date.now() || !entry.valid()) entries.delete(key)
  if (entries.size >= 64) throw new Error('Too many open profile views')
  const key = `/${randomBytes(32).toString('hex')}`
  entries.set(key, { html, valid, expires: Date.now() + 10 * 60 * 1000 })
  return { url: `http://127.0.0.1:${server.address().port}${key}`, revoke: () => entries.delete(key) }
}
module.exports = { createEntry }
