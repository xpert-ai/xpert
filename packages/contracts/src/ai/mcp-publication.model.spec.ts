import { MCP_HTTP_CORS_EXPOSED_HEADERS, MCP_HTTP_CORS_REQUEST_HEADERS } from './mcp-publication.model'

describe('MCP Streamable HTTP browser contract', () => {
  it('allows routing, protocol, and tracing headers through CORS', () => {
    expect(MCP_HTTP_CORS_REQUEST_HEADERS).toEqual(
      expect.arrayContaining([
        'MCP-Protocol-Version',
        'Mcp-Method',
        'Mcp-Name',
        'Traceparent',
        'Tracestate',
        'Baggage',
        'X-Request-Id'
      ])
    )
  })

  it('exposes OAuth challenge and request correlation headers to browser clients', () => {
    expect(MCP_HTTP_CORS_EXPOSED_HEADERS).toEqual(
      expect.arrayContaining(['WWW-Authenticate', 'MCP-Protocol-Version', 'X-Request-Id'])
    )
  })
})
