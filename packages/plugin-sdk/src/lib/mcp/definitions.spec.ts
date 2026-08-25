import {
  defineMcpApp,
  defineMcpCapabilities,
  defineMcpPrompt,
  defineMcpResource,
  defineMcpResourceTemplate
} from './index'
import { defineXpertTool } from '../toolset/define-tool'
import type { ToolExecutionContext } from '../toolset/tool-execution-context'
import { z } from 'zod'

const context: ToolExecutionContext = {
  source: 'mcp',
  tenantId: 'tenant-1',
  workspaceId: 'workspace-1',
  principal: { type: 'service_account', id: 'service-1', clientId: 'client-1' },
  executionId: 'execution-1',
  requestId: 'request-1',
  host: {}
}

describe('MCP plugin declarations', () => {
  it('defines resources, templates, prompts, and app bundles without starting a server', async () => {
    const resource = defineMcpResource({
      key: 'overview',
      uri: 'xpert://overview',
      mimeType: 'application/json',
      async read() {
        return { contents: [{ uri: 'xpert://overview', text: '{}' }] }
      }
    })
    const template = defineMcpResourceTemplate({
      key: 'document',
      uriTemplate: 'xpert://documents/{documentId}',
      arguments: { documentId: { required: true } },
      async read({ documentId }) {
        return { contents: [{ uri: `xpert://documents/${documentId}`, text: documentId }] }
      },
      async complete() {
        return { values: ['one'], hasMore: false }
      }
    })
    const prompt = defineMcpPrompt({
      key: 'review',
      name: 'review_document',
      arguments: { documentId: { required: true } },
      async get({ documentId }) {
        return { messages: [{ role: 'user', content: { type: 'text', text: documentId } }] }
      }
    })
    const app = defineMcpApp({
      key: 'browser',
      entry: './apps/browser/index.html',
      csp: { connectDomains: [], resourceDomains: [] },
      permissions: { clipboardWrite: true }
    })
    const tool = defineXpertTool({
      name: 'search',
      description: 'Search documents',
      inputSchema: z.object({ query: z.string() }),
      exposure: { mcp: { eligible: true } },
      behavior: { risk: 'read', sideEffect: 'none', idempotency: 'safe' },
      requiredContext: ['workspace'],
      async execute() {
        return { content: [{ type: 'text', text: 'done' }] }
      }
    })
    const capabilities = defineMcpCapabilities({
      instructions: 'Prefer document resources before search tools.',
      tools: [tool],
      resources: [resource],
      apps: [app]
    })

    expect(Object.isFrozen(resource)).toBe(true)
    await expect(resource.read(context)).resolves.toEqual({ contents: [{ uri: 'xpert://overview', text: '{}' }] })
    await expect(template.read({ documentId: 'one' }, context)).resolves.toMatchObject({
      contents: [{ uri: 'xpert://documents/one' }]
    })
    await expect(prompt.get({ documentId: 'one' }, context)).resolves.toMatchObject({
      messages: [{ role: 'user' }]
    })
    expect(app.entry).toBe('./apps/browser/index.html')
    expect(capabilities.instructions).toBe('Prefer document resources before search tools.')
    expect(capabilities.tools).toEqual([tool])
    expect(Object.isFrozen(capabilities.tools)).toBe(true)
  })
})
