import {
  canAllowMcpToolDirectly,
  defaultMcpToolApprovalMode,
  McpToolCapabilityDescriptor,
  McpToolRisk
} from './mcp-capability.model'

describe('MCP tool declaration defaults', () => {
  const descriptor = (risk: McpToolRisk, defaultApprovalMode?: McpToolCapabilityDescriptor['defaultApprovalMode']) => ({
    behavior: { risk, sideEffect: 'reversible' as const, idempotency: 'idempotent' as const },
    defaultApprovalMode
  })
  it('keeps existing risk defaults without a declaration', () => {
    expect(
      ['read', 'write', 'dangerous'].map((risk) => defaultMcpToolApprovalMode(descriptor(risk as McpToolRisk)))
    ).toEqual(['allow', 'confirm', 'deny'])
    expect(canAllowMcpToolDirectly(descriptor('dangerous'))).toBe(false)
  })
  it('supports explicit application defaults without changing risk annotations', () => {
    for (const risk of ['read', 'write', 'dangerous'] as const) {
      expect(defaultMcpToolApprovalMode(descriptor(risk, 'allow'))).toBe('allow')
      expect(canAllowMcpToolDirectly(descriptor(risk, 'allow'))).toBe(true)
    }
    expect(canAllowMcpToolDirectly(descriptor('dangerous', 'confirm'))).toBe(false)
  })
})
