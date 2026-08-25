import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'
import { filterMcpTools } from './mcp-tool-filter'

const DEMO_MCP_TOOL_NAMES = ['demo_create', 'demo_validate', 'demo_apply', 'demo_compare'] as const

function createTool(name: string, visibility?: string[]) {
    return new DynamicStructuredTool({
        name,
        description: name,
        schema: z.object({}),
        func: async () => ({ ok: true }),
        ...(visibility ? { metadata: { mcpApp: { visibility } } } : {})
    })
}

describe('plugin-managed MCP tool filtering', () => {
    it('enforces the plugin manifest allowlist for discovery and model tools', () => {
        const tools = [...DEMO_MCP_TOOL_NAMES.map((name) => createTool(name)), createTool('demo_internal_debug')]

        const filtered = filterMcpTools(
            {
                options: { disableToolDefault: true },
                tools: DEMO_MCP_TOOL_NAMES.map((name) => ({ name, enabled: true }))
            },
            tools
        )

        expect(filtered.map((tool) => tool.name)).toEqual([...DEMO_MCP_TOOL_NAMES])
    })

    it('keeps explicit disabled tools and app-only tools out of discovery', () => {
        const filtered = filterMcpTools(
            {
                options: { disableToolDefault: true },
                tools: [
                    { name: 'demo_create', enabled: true },
                    { name: 'demo_validate', enabled: false }
                ]
            },
            [createTool('demo_create'), createTool('demo_validate'), createTool('demo_compare', ['app'])]
        )

        expect(filtered.map((tool) => tool.name)).toEqual(['demo_create'])
    })
})
