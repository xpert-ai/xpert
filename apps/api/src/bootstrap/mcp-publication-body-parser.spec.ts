import type { AddressInfo } from 'node:net'
import { json, Request, Response } from 'express'
import express = require('express')
import { createMcpPublicationJsonBodyParser, MCP_PUBLICATION_MAX_BODY_BYTES } from './mcp-publication-body-parser'

describe('MCP Publication API body parser', () => {
  it('rejects oversized MCP requests before the ordinary 50 MiB parser accepts them', async () => {
    const app = createTestApp()
    const server = app.listen(0)

    try {
      await new Promise<void>((resolve) => server.once('listening', resolve))
      const body = JSON.stringify({ value: 'x'.repeat(MCP_PUBLICATION_MAX_BODY_BYTES) })
      const origin = getServerOrigin(server.address() as AddressInfo)

      const mcpResponse = await fetch(`${origin}/api/mcp/p/test`, {
        body,
        headers: { 'content-type': 'application/json' },
        method: 'POST'
      })
      const ordinaryResponse = await fetch(`${origin}/api/ordinary`, {
        body,
        headers: { 'content-type': 'application/json' },
        method: 'POST'
      })

      expect(mcpResponse.status).toBe(413)
      expect(ordinaryResponse.status).toBe(200)
      expect(await ordinaryResponse.json()).toEqual({ bytes: body.length })
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
      )
    }
  })
})

function createTestApp() {
  const app = express()
  app.use('/api/mcp/p', createMcpPublicationJsonBodyParser())
  app.use(json({ limit: '50mb' }))
  app.use((request: Request, response: Response) => {
    response.json({ bytes: JSON.stringify(request.body).length })
  })
  return app
}

function getServerOrigin(address: AddressInfo) {
  return `http://127.0.0.1:${address.port}`
}
