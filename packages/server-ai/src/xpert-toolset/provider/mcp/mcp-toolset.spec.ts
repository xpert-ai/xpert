import fs from 'node:fs'
import path from 'node:path'

describe('MCPToolset transport cleanup', () => {
    it('does not pass graph abort signals into individual MCP requests', () => {
        const content = fs.readFileSync(path.join(__dirname, 'mcp-toolset.ts'), 'utf8')

        expect(content).toContain('function omitSignalFromRunnableConfig')
        expect(content).toContain('delete nextConfig.signal')
        expect(content).toContain(
            'func: (input, runManager, config) => tool.func(input, runManager, omitSignalFromRunnableConfig(config))'
        )
        expect(content).toContain('.map((tool) => wrapMCPTool(tool))')
    })

    it('force-closes EventSource transports before and after client close', () => {
        const content = fs.readFileSync(path.join(__dirname, 'mcp-toolset.ts'), 'utf8')

        expect(content).toContain('function forceCloseSSETransport')
        expect(content).toContain("Reflect.set(value, 'onerror', null)")
        expect(content).toContain("Reflect.set(value, 'onmessage', null)")
        expect(content).toContain("Reflect.set(value, 'onopen', null)")
        expect(content).toContain('abort.call(abortController)')
        expect(content).toContain("Reflect.set(transport, '_eventSource', undefined)")
        expect(content).toMatch(
            /forceCloseMCPClientTransports\(this\.client\)\s+await this\.client\.close\(\)\s+forceCloseMCPClientTransports\(this\.client\)/
        )
    })
})
