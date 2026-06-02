import { MCPServerType, XpertToolsetCategoryEnum } from '@cloud/app/@core'
import { createMCPToolsetFromJson } from './import-json.component'

describe('createMCPToolsetFromJson', () => {
  it('creates a stdio MCP toolset from mcpServers JSON', () => {
    const toolset = createMCPToolsetFromJson(`{
      "mcpServers": {
        "edgeone-pages-mcp-server": {
          "command": "npx",
          "args": [
            "edgeone-pages-mcp"
          ]
        }
      }
    }`)

    expect(toolset.name).toBe('edgeone-pages-mcp-server')
    expect(toolset.category).toBe(XpertToolsetCategoryEnum.MCP)
    expect(toolset.type).toBe(MCPServerType.STDIO)
    expect(JSON.parse(toolset.schema)).toEqual({
      mcpServers: {
        '': {
          type: MCPServerType.STDIO,
          command: 'npx',
          args: ['edgeone-pages-mcp']
        }
      }
    })
  })

  it('imports a URL-only MCP server as SSE for legacy compatibility', () => {
    const toolset = createMCPToolsetFromJson(`{
      "mcpServers": {
        "legacy-remote": {
          "url": "https://example.com/sse"
        }
      }
    }`)

    expect(toolset.type).toBe(MCPServerType.SSE)
    expect(JSON.parse(toolset.schema)).toEqual({
      mcpServers: {
        '': {
          type: MCPServerType.SSE,
          url: 'https://example.com/sse'
        }
      }
    })
  })

  it('rejects JSON without an MCP server map', () => {
    expect(() => createMCPToolsetFromJson('{"name":"not mcp"}')).toThrow('MCP JSON must include mcpServers or servers')
  })
})
