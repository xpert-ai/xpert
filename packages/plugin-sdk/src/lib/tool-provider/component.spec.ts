import { z } from 'zod/v3'
import { runtimeToolProviderComponent } from './component'
import { XpertTool, XpertToolProvider } from './decorators'
import type { XpertMcpToolOptions, XpertToolProviderInstance } from './types'

type Extensions = ReturnType<NonNullable<XpertToolProviderInstance['getMcpExtensions']>>
const read = jest.fn(() => ({ contents: [] }))
const get = jest.fn(() => ({ messages: [] }))
const baseExtensions: Extensions = {
  resources: [{ key: 'project', uri: 'cut://project', description: 'Project', read }],
  resourceTemplates: [{ key: 'clip', uriTemplate: 'cut://clips/{id}', arguments: { id: { required: true } }, read }],
  prompts: [{ key: 'edit', name: 'edit', arguments: { goal: { required: true } }, get }]
}

function component(mcp: Partial<XpertMcpToolOptions> = {}, extensions: Extensions = baseExtensions) {
  @XpertToolProvider({ provider: 'cut', componentKey: 'cut', name: 'Cut' })
  class Provider {
    getMcpExtensions() {
      return extensions
    }

    @XpertTool({
      name: 'list',
      description: 'List',
      inputSchema: z.object({ projectId: z.string().optional() }).strict(),
      resultFormat: 'tool_result',
      mcp: { behavior: { risk: 'read', sideEffect: 'none', idempotency: 'safe' }, requiredContext: ['tenant'], ...mcp }
    })
    list() {
      return { content: [] }
    }
  }
  return runtimeToolProviderComponent(new Provider())
}

describe('runtime tool provider component fingerprint', () => {
  it('detects transport-only input changes', () => {
    expect(component({ inputSchema: z.object({ projectId: z.string() }).strict() }).definitionHash).not.toBe(
      component().definitionHash
    )
  })

  it('detects task policy and lifetime changes', () => {
    const optional = component({ task: { mode: 'optional', maxLifetimeMs: 1000 } }).definitionHash
    expect(optional).not.toBe(component().definitionHash)
    expect(optional).not.toBe(component({ task: { mode: 'required', maxLifetimeMs: 1000 } }).definitionHash)
    expect(optional).not.toBe(component({ task: { mode: 'optional', maxLifetimeMs: 2000 } }).definitionHash)
  })

  it.each<Extensions>([
    { ...baseExtensions, resources: [{ ...baseExtensions.resources[0], uri: 'cut://new-project' }] },
    {
      ...baseExtensions,
      resourceTemplates: [{ ...baseExtensions.resourceTemplates[0], arguments: { id: { required: false } } }]
    },
    { ...baseExtensions, prompts: [{ ...baseExtensions.prompts[0], description: 'New instructions' }] },
    { ...baseExtensions, resources: [] },
    { ...baseExtensions, resourceTemplates: [] },
    { ...baseExtensions, prompts: [] }
  ])('detects changed or removed non-tool definitions %#', (extensions) => {
    expect(component({}, extensions).definitionHash).not.toBe(component().definitionHash)
  })

  it('is stable across object key ordering and callback instances without executing callbacks', () => {
    const extensions: Extensions = {
      ...baseExtensions,
      resources: [{ read: () => ({ contents: [] }), description: 'Project', uri: 'cut://project', key: 'project' }]
    }
    expect(component({}, extensions)).toEqual(component())
    expect(read).not.toHaveBeenCalled()
    expect(get).not.toHaveBeenCalled()
  })
})
