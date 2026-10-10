import type { HttpRequestMetricInput } from '@xpert-ai/server-ai'
import express = require('express')
import { json } from 'express'
import { get, Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createHttpRequestMetricsMiddleware } from './http-request-metrics'

describe('HTTP API request metrics', () => {
  let server: Server
  let origin: string
  let elapsed: number
  let requests: HttpRequestMetricInput[]
  let app: express.Express

  beforeEach(async () => {
    elapsed = 0
    requests = []
    app = express()
    app.use(
      createHttpRequestMetricsMiddleware(
        (input) => requests.push(input),
        () => elapsed
      )
    )
    server = app.listen(0, '127.0.0.1')
    await new Promise<void>((resolve) => server.once('listening', resolve))
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterEach(async () => {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  })

  it('measures the full response once and groups requests by their registered route template', async () => {
    app.get('/api/items/:id', (_request, response) => {
      elapsed += 600
      response.json({ ok: true })
    })
    for (const id of ['item-one', 'item-two']) {
      const response = await fetch(`${origin}/api/items/${id}?token=private-value`)
      expect(response.status).toBe(200)
      await response.text()
    }
    expect(requests).toEqual([
      expect.objectContaining({ route: '/api/items/:id', durationMs: 600, method: 'GET', outcome: 'completed' }),
      expect.objectContaining({ route: '/api/items/:id', durationMs: 600, method: 'GET', outcome: 'completed' })
    ])
    expect(JSON.stringify(requests)).not.toMatch(/item-one|item-two|private-value|token=/)
  })

  it('includes auth failures and error responses without changing them', async () => {
    app.get('/api/private/:id', (_request, response) => {
      elapsed = 20
      response.status(403).json({ error: 'forbidden' })
    })
    app.get('/api/failure', (_request, _response, next) => next(new Error('test failure')))
    // Express recognizes error handlers by their four-argument signature.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    app.use((_error: Error, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
      response.status(500).json({ error: 'test failure' })
    })
    const forbidden = await fetch(`${origin}/api/private/user-id`)
    expect(await forbidden.json()).toEqual({ error: 'forbidden' })
    const failure = await fetch(`${origin}/api/failure`)
    expect(failure.status).toBe(500)
    await failure.text()
    expect(requests).toEqual([
      expect.objectContaining({ route: '/api/private/:id', statusCode: 403, outcome: 'completed' }),
      expect.objectContaining({ route: '/api/failure', statusCode: 500, outcome: 'completed' })
    ])
  })

  it('uses a bounded unmatched label for 404s and errors before route dispatch', async () => {
    app.use(json({ limit: 10 }))
    app.post('/api/items', (_request, response) => response.json({ ok: true }))
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    app.use((_error: Error, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
      response.sendStatus(413)
    })
    const missing = await fetch(`${origin}/api/unknown/private-id?key=secret`)
    expect(missing.status).toBe(404)
    await missing.text()
    const oversized = await fetch(`${origin}/api/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'too large' })
    })
    expect(oversized.status).toBe(413)
    await oversized.text()
    expect(requests).toEqual([
      expect.objectContaining({ route: 'unmatched', statusCode: 404 }),
      expect.objectContaining({ route: 'unmatched', statusCode: 413 })
    ])
  })

  it('keeps SSE duration separate from ordinary HTTP responses', async () => {
    app.get('/api/events', (_request, response) => {
      response.setHeader('content-type', 'text/event-stream; charset=utf-8')
      elapsed = 20000
      response.end('data: done\n\n')
    })
    const response = await fetch(`${origin}/api/events`)
    expect(await response.text()).toBe('data: done\n\n')
    expect(requests).toEqual([
      expect.objectContaining({ route: '/api/events', durationMs: 20000, responseType: 'sse', outcome: 'completed' })
    ])
  })

  it('records an aborted response once when the client disconnects', async () => {
    const recorded = new Promise<HttpRequestMetricInput>((resolve) => {
      app.get('/api/download/:id', (_request, response) => {
        response.once('close', () => resolve(requests[0]))
        response.write('first chunk')
        elapsed = 750
      })
    })
    await new Promise<void>((resolve, reject) => {
      get(`${origin}/api/download/private-id`, (response) => {
        response.once('data', () => {
          response.destroy()
          resolve()
        })
      }).once('error', reject)
    })
    expect(await recorded).toEqual({
      method: 'GET',
      route: '/api/download/:id',
      statusCode: 200,
      responseType: 'http',
      outcome: 'aborted',
      durationMs: 750
    })
    expect(requests).toHaveLength(1)
  })

  it('excludes health checks, scrapes, and non-API traffic', async () => {
    for (const route of ['/metrics', '/api/metrics', '/api/health', '/api/health/live', '/assets/file']) {
      app.get(route, (_request, response) => response.sendStatus(200))
      const response = await fetch(origin + route)
      await response.text()
    }
    expect(requests).toEqual([])
  })

  it('does not put resolved router mount parameters in metric labels', async () => {
    const router = express.Router()
    router.get('/items/:id', (_request, response) => response.sendStatus(200))
    app.use('/api/projects/:projectId', router)
    const response = await fetch(`${origin}/api/projects/private-project/items/private-item`)
    await response.text()
    expect(requests).toEqual([expect.objectContaining({ route: '/items/:id' })])
    expect(JSON.stringify(requests)).not.toMatch(/private-project|private-item/)
  })
})
