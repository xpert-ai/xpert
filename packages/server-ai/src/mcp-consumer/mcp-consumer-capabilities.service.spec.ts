import { normalizeMcpConsumerToolVisibility } from './mcp-consumer-capabilities.service'

describe('McpConsumerCapabilitiesService', () => {
    it('preserves app-only tool visibility from the nested MCP Apps metadata', () => {
        expect(
            normalizeMcpConsumerToolVisibility({
                _meta: { ui: { visibility: ['app'] } }
            })
        ).toEqual(['app'])
    })

    it('uses the MCP Apps default visibility when a server omits or corrupts the hint', () => {
        expect(normalizeMcpConsumerToolVisibility({})).toEqual(['model', 'app'])
        expect(
            normalizeMcpConsumerToolVisibility({
                _meta: { ui: { visibility: ['unknown'] } }
            })
        ).toEqual(['model', 'app'])
    })
})
