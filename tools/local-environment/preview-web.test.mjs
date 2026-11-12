import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { startPreview } from './preview-web.mjs'

test('preview serves the built SPA and proxies API bodies and streaming responses', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'xpert-web-preview-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  await writeFile(path.join(directory, 'index.html'), '<html><body>local-xpert</body></html>')
  await writeFile(path.join(directory, 'main.js'), 'console.log("built-source")')
  const api = createServer(async (request, response) => {
    if (request.url === '/api/events') {
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      response.write('data: first\n\n')
      setTimeout(() => response.end('data: second\n\n'), 30)
      return
    }
    let body = ''
    for await (const chunk of request) body += chunk
    response.writeHead(201, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ method: request.method, url: request.url, body }))
  })
  await new Promise((resolve) => api.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise((resolve) => api.close(resolve)))
  const proxy = { target: `http://127.0.0.1:${api.address().port}`, changeOrigin: true }
  const server = await startPreview({ directory, port: 0, proxy: { '/api': proxy, '/oidc': proxy } })
  t.after(() => new Promise((resolve) => server.httpServer.close(resolve)))
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`
  const page = await fetch(origin + '/projects/example', { headers: { accept: 'text/html' } })
  assert.equal(page.status, 200)
  assert.match(await page.text(), /local-xpert/)
  assert.match(await (await fetch(origin + '/main.js')).text(), /built-source/)
  const result = await fetch(origin + '/api/probe', { method: 'POST', body: 'local-payload' })
  assert.equal(result.status, 201)
  assert.deepEqual(await result.json(), { method: 'POST', url: '/api/probe', body: 'local-payload' })
  assert.equal((await (await fetch(origin + '/oidc/discovery')).json()).url, '/oidc/discovery')
  assert.equal(await (await fetch(origin + '/api/events')).text(), 'data: first\n\ndata: second\n\n')
})

test('preview refuses a directory without a completed build', async () => {
  await assert.rejects(startPreview({ directory: '/missing-xpert-build', port: 0, proxy: {} }), /ENOENT/)
})
