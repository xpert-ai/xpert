import type { XpertResolvedViewHostContext } from '../view-extension/model'
import {
  MCP_HTTP_CORS_EXPOSED_HEADERS,
  MCP_HTTP_CORS_REQUEST_HEADERS,
  isMcpPublicationViewHostContext,
  isMcpPublicationViewHostSnapshot
} from './mcp-publication.model'

describe('MCP Streamable HTTP browser contract', () => {
  it('allows routing, protocol, and tracing headers through CORS', () => {
    expect(MCP_HTTP_CORS_REQUEST_HEADERS).toEqual(
      expect.arrayContaining([
        'MCP-Protocol-Version',
        'Mcp-Session-Id',
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
      expect.arrayContaining([
        'Content-Location',
        'WWW-Authenticate',
        'MCP-Protocol-Version',
        'Mcp-Session-Id',
        'X-Request-Id'
      ])
    )
  })
})

const source = { toolsetId: 'toolset-1', name: 'Example', provider: 'example', pluginName: '@example/plugin' }

function createContext(overrides: Partial<XpertResolvedViewHostContext>): XpertResolvedViewHostContext {
  return {
    tenantId: 'tenant-1',
    userId: 'user-1',
    hostType: 'mcp-publication',
    hostId: 'publication-1',
    slots: [],
    hostSnapshot: { id: 'publication-1', sources: [source] },
    ...overrides
  }
}

describe('MCP publication view host context', () => {
  it('narrows the host snapshot by host type', () => {
    const inputContext = createContext({})
    expect(isMcpPublicationViewHostContext(inputContext)).toBe(true)
    if (isMcpPublicationViewHostContext(inputContext)) {
      expect(inputContext.hostSnapshot.sources[0].pluginName).toBe('@example/plugin')
    }
  })

  it('rejects other host types and malformed snapshots', () => {
    expect(isMcpPublicationViewHostContext(createContext({ hostType: 'agent' }))).toBe(false)
    expect(isMcpPublicationViewHostContext(createContext({ hostSnapshot: undefined }))).toBe(false)
    expect(isMcpPublicationViewHostSnapshot({ id: 'publication-1', sources: [{ ...source, provider: 1 }] })).toBe(false)
    expect(isMcpPublicationViewHostSnapshot({ sources: [] })).toBe(false)
  })
})
