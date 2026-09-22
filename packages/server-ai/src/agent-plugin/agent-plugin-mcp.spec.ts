import { matchesPortableMcpSchema, portableMcpSchema } from './agent-plugin-mcp'

const server = { key: 'example', config: { type: 'streamable-http' as const, url: 'https://example.org/mcp' } }

describe('portable MCP boundary', () => {
    it('adapts transport and personal OAuth without modifying the portable descriptor', () => {
        expect(portableMcpSchema(server, true)).toEqual({
            mcpServers: { example: { type: 'http', url: server.config.url, auth: { type: 'oauth', binding: 'user' } } }
        })
        expect(server.config.type).toBe('streamable-http')
    })
    it('rejects configuration changes behind a pinned binding', () => {
        const expected = portableMcpSchema(server, true)
        expect(matchesPortableMcpSchema(JSON.stringify(expected), server, true)).toBe(true)
        expect(matchesPortableMcpSchema(JSON.stringify(expected), server, false)).toBe(false)
        expected.mcpServers.example.url = 'https://different.example.org/mcp'
        expect(matchesPortableMcpSchema(JSON.stringify(expected), server, true)).toBe(false)
        expect(matchesPortableMcpSchema('{', server, true)).toBe(false)
    })
})
