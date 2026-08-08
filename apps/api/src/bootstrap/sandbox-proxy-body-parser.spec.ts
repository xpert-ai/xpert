import type { AddressInfo } from 'node:net'
import { json, Request, Response, text, urlencoded } from 'express'
import express = require('express')
import { createSandboxAwareBodyParserType, isSandboxPreviewProxyRequest } from './sandbox-proxy-body-parser'

type TestCase = {
  body: string
  contentType: string
  expectedParsedBody: unknown
}

const cases: TestCase[] = [
  {
    body: '{ "second": 2, "first": 1 }\n',
    contentType: 'application/json; charset=utf-8',
    expectedParsedBody: { first: 1, second: 2 }
  },
  {
    body: 'item=a+b&item=c%20d',
    contentType: 'application/x-www-form-urlencoded',
    expectedParsedBody: { item: ['a b', 'c d'] }
  },
  {
    body: '<root value="a+b">c%20d</root>',
    contentType: 'text/xml; charset=utf-8',
    expectedParsedBody: '<root value="a+b">c%20d</root>'
  }
]

describe('sandbox-aware API body parsers', () => {
  it.each(cases)('leaves $contentType proxy bodies as the original byte stream', async ({ body, contentType }) => {
    const app = createTestApp()
    const server = app.listen(0)

    try {
      await new Promise<void>((resolve) => server.once('listening', resolve))
      const response = await fetch(
        `${getServerOrigin(server.address() as AddressInfo)}/api/sandbox/conversations/conversation-1/services/service-1/proxy/api`,
        {
          body,
          headers: { 'content-type': contentType },
          method: 'POST'
        }
      )

      expect(response.status).toBe(200)
      expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from(body))
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

  it.each(cases)(
    'keeps parsing $contentType for ordinary API routes',
    async ({ body, contentType, expectedParsedBody }) => {
      const app = createTestApp()
      const server = app.listen(0)

      try {
        await new Promise<void>((resolve) => server.once('listening', resolve))
        const response = await fetch(`${getServerOrigin(server.address() as AddressInfo)}/api/ordinary`, {
          body,
          headers: { 'content-type': contentType },
          method: 'POST'
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual(expectedParsedBody)
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
    }
  )
})

function createTestApp() {
  const app = express()
  app.use(
    text({
      limit: '50mb',
      type: createSandboxAwareBodyParserType('text/xml')
    })
  )
  app.use(
    json({
      limit: '50mb',
      type: createSandboxAwareBodyParserType('application/json')
    })
  )
  app.use(
    urlencoded({
      extended: true,
      limit: '50mb',
      type: createSandboxAwareBodyParserType('application/x-www-form-urlencoded')
    })
  )
  app.use(async (request: Request, response: Response) => {
    if (!isSandboxPreviewProxyRequest(request)) {
      response.json(request.body)
      return
    }

    const chunks: Buffer[] = []
    for await (const chunk of request) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    response.end(Buffer.concat(chunks))
  })
  return app
}

function getServerOrigin(address: AddressInfo): string {
  return `http://127.0.0.1:${address.port}`
}
