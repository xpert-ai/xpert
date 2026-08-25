import {
  MCP_CAPABILITY_TYPES,
  MCP_REQUIRED_CONTEXTS,
  MCP_TOOL_IDEMPOTENCY,
  MCP_TOOL_RISKS,
  MCP_TOOL_SIDE_EFFECTS
} from './mcp-capability.model'
import { MCP_AUTH_METHODS, MCP_PROTOCOL_VERSION, MCP_PUBLICATION_STATUSES } from './mcp-publication.model'
import { MCP_API_KEY_SUBJECT_TYPES } from './mcp-auth.model'

describe('MCP publication contracts', () => {
  it('keeps the publication protocol and persisted state values stable', () => {
    expect(MCP_PROTOCOL_VERSION).toBe('2026-07-28')
    expect(MCP_PUBLICATION_STATUSES).toEqual(['draft', 'active', 'disabled'])
    expect(MCP_AUTH_METHODS).toEqual(['api_key', 'oauth'])
    expect(MCP_API_KEY_SUBJECT_TYPES).toEqual(['user', 'service_account'])
  })

  it('keeps capability and tool behavior discriminators machine-readable', () => {
    expect(MCP_CAPABILITY_TYPES).toEqual(['tool', 'resource', 'resource_template', 'prompt', 'app'])
    expect(MCP_TOOL_RISKS).toEqual(['read', 'write', 'dangerous'])
    expect(MCP_TOOL_SIDE_EFFECTS).toEqual(['none', 'reversible', 'irreversible'])
    expect(MCP_TOOL_IDEMPOTENCY).toEqual(['safe', 'idempotent', 'non_idempotent'])
    expect(MCP_REQUIRED_CONTEXTS).toEqual([
      'tenant',
      'organization',
      'workspace',
      'principal',
      'project',
      'conversation',
      'agent',
      'execution',
      'store',
      'checkpoint'
    ])
  })
})
