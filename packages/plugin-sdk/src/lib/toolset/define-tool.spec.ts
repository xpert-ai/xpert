import { z } from 'zod/v3'
import { defineXpertTool } from './define-tool'
import type { ToolExecutionContext } from './tool-execution-context'

const context: ToolExecutionContext = {
  source: 'mcp',
  tenantId: 'tenant-1',
  workspaceId: 'workspace-1',
  principal: {
    type: 'user',
    id: 'user-1',
    userId: 'user-1'
  },
  executionId: 'execution-1',
  requestId: 'request-1',
  host: {}
}

describe('defineXpertTool', () => {
  it('preserves the typed declaration and unified result contract', async () => {
    const tool = defineXpertTool({
      name: 'search_document',
      title: 'Search documents',
      description: 'Searches the active workspace.',
      inputSchema: z.object({ query: z.string() }),
      outputSchema: z.object({ count: z.number() }),
      exposure: { mcp: { eligible: true } },
      behavior: {
        risk: 'read',
        sideEffect: 'none',
        idempotency: 'safe'
      },
      requiredContext: ['workspace', 'principal'],
      async execute(input, executionContext) {
        return {
          content: [{ type: 'text', text: input.query }],
          structuredContent: { count: executionContext.workspaceId.length }
        }
      }
    })

    expect(Object.isFrozen(tool)).toBe(true)
    expect(tool.exposure.mcp.eligible).toBe(true)
    await expect(tool.execute({ query: 'MCP' }, context)).resolves.toMatchObject({
      content: [{ type: 'text', text: 'MCP' }],
      structuredContent: { count: 11 }
    })
  })
})
