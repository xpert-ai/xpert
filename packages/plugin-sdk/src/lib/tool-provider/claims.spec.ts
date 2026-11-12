import 'reflect-metadata'
import { Reflector } from '@nestjs/core'
import { z } from 'zod/v3'
import { ORGANIZATION_METADATA_KEY, PLUGIN_METADATA_KEY } from '../types'
import { XpertTool, XpertToolProvider } from './decorators'
import { XpertToolProviderRegistry } from './registry'

function provider(name: string, componentKey: string, toolName: string, plugin: string, scope = 'org-a') {
  @XpertToolProvider({ provider: name, componentKey, name })
  class Provider {
    @XpertTool({
      name: toolName,
      description: 'Test tool',
      inputSchema: z.object({}).strict(),
      outputSchema: z.object({ ok: z.boolean() }).strict(),
      middleware: false,
      mcp: {
        requiredContext: ['tenant'],
        visibility: ['model'],
        behavior: { risk: 'read', sideEffect: 'none', idempotency: 'safe' }
      }
    })
    execute() {
      return { ok: true }
    }
  }
  Reflect.defineMetadata(PLUGIN_METADATA_KEY, plugin, Provider)
  Reflect.defineMetadata(ORGANIZATION_METADATA_KEY, scope, Provider)
  return new Provider()
}

describe('plugin-qualified component claims', () => {
  const registry = () => new XpertToolProviderRegistry({ getProviders: () => [] } as never, new Reflector())

  it('allows two plugins to use tools in the same scope without replacing either provider', () => {
    const store = registry()
    const first = provider('json_tools', 'tools', 'format_json', '@test/json')
    const second = provider('url_tools', 'tools', 'encode_url', '@test/url')
    store.upsert(first)
    store.upsert(second)
    expect(store.listRegistrations('org-a').map(({ source }) => source)).toEqual([
      expect.objectContaining({ pluginName: '@test/json' }),
      expect.objectContaining({ pluginName: '@test/url' })
    ])
    expect(store.get('json_tools', 'org-a')).toBe(first)
    expect(store.get('url_tools', 'org-a')).toBe(second)
  })

  it('still rejects duplicate components inside the same plugin', () => {
    const store = registry()
    store.upsert(provider('first', 'tools', 'first_tool', '@test/one'))
    expect(() => store.upsert(provider('second', 'tools', 'second_tool', '@test/one'))).toThrow(/Component key 'tools'/)
    expect(store.list('org-a')).toHaveLength(1)
  })

  it('preserves public provider and Tool name conflict checks and the original registration', () => {
    const store = registry()
    const first = provider('shared_provider', 'tools', 'shared_tool', '@test/one')
    store.upsert(first)
    expect(() => store.upsert(provider('shared_provider', 'other', 'different', '@test/two'))).toThrow(
      /Provider 'shared_provider'/
    )
    expect(() => store.upsert(provider('different', 'other', 'shared_tool', '@test/two'))).toThrow(/Tool 'shared_tool'/)
    expect(store.get('shared_provider', 'org-a')).toBe(first)
  })

  it('keeps scope isolation and same-plugin replacement/rollback', () => {
    const store = registry()
    const original = provider('shared', 'tools', 'same_tool', '@test/one')
    const replacement = provider('shared', 'tools', 'same_tool', '@test/one')
    store.upsert(original)
    store.upsert(provider('shared', 'tools', 'same_tool', '@test/two', 'org-b'))
    store.upsert(replacement)
    expect(store.get('shared', 'org-a')).toBe(replacement)
    store.rollback(replacement)
    expect(store.get('shared', 'org-a')).toBe(original)
    expect(store.listAllRegistrations()).toHaveLength(2)
  })
})
