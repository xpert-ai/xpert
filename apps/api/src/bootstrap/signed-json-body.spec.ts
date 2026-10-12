import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { captureSignedJsonBody } from './signed-json-body'

describe('signed JSON request bytes', () => {
  const request = (): IncomingMessage & { rawBody?: Buffer } => new IncomingMessage(new Socket())
  it('retains byte-exact signed JSON independently of the parsed object', () => {
    const req = request(),
      body = Buffer.from('{ "action" : "opened" }\n')
    req.headers['x-hub-signature-256'] = 'sha256=fixture'
    captureSignedJsonBody(req, new ServerResponse(req), body)
    expect(req.rawBody).toEqual(body)
    expect(req.rawBody).not.toBe(body)
    expect(req.rawBody?.toString()).not.toBe(JSON.stringify(JSON.parse(body.toString())))
  })
  it('does not retain ordinary or oversized JSON bodies', () => {
    const req = request()
    captureSignedJsonBody(req, new ServerResponse(req), Buffer.from('{}'))
    expect(req.rawBody).toBeUndefined()
    req.headers['x-hub-signature-256'] = 'sha256=fixture'
    captureSignedJsonBody(req, new ServerResponse(req), Buffer.alloc(2 * 1024 * 1024 + 1))
    expect(req.rawBody).toBeUndefined()
  })
})
