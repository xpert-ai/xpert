import { z } from 'zod/v3'
import { XpertTool, XpertToolProvider } from './decorators'
import { XpertResource, XpertResourceTemplate, XpertPrompt } from './mcp-methods'
import { DecoratedToolsetStrategy } from './adapters'
import { describeXpertToolProvider } from './descriptor'
import { runtimeToolProviderComponent } from './component'
import type { ResourceReadContext } from '../mcp/resource'
import type { ToolExecutionContext } from '../toolset/tool-execution-context'

@XpertToolProvider({ provider: 'mixed', componentKey: 'mixed', name: 'Mixed' })
class Provider {
  readonly value = 'from-instance'
  @XpertTool({
    name: 'read',
    description: 'Read',
    inputSchema: z.object({}).strict(),
    resultFormat: 'tool_result',
    mcp: { behavior: { risk: 'read', sideEffect: 'none', idempotency: 'safe' }, requiredContext: ['tenant'] }
  })
  tool() {
    return { content: [] }
  }

  @XpertResource({ key: 'overview', uri: 'test://overview', requiredContext: ['tenant'] })
  resource(context: ResourceReadContext) {
    return { contents: [{ uri: context.resourceUri, text: `${this.value}:${context.tenantId}` }] }
  }

  @XpertResourceTemplate({ key: 'item', uriTemplate: 'test://items/{id}', arguments: { id: { required: true } } })
  template(args: Record<string, string>, context: ResourceReadContext) {
    return { contents: [{ uri: context.resourceUri, text: `${this.value}:${args.id}` }] }
  }

  @XpertPrompt({ key: 'plan', name: 'plan', arguments: { goal: { required: true } } })
  prompt(args: Record<string, string>, context: ToolExecutionContext) {
    return {
      messages: [
        {
          role: 'user' as const,
          content: { type: 'text' as const, text: `${this.value}:${args.goal}:${context.tenantId}` }
        }
      ]
    }
  }
}

async function definitions(provider: object) {
  return (await new DecoratedToolsetStrategy(provider).create({ name: 'Test' })).getMcpCapabilityDefinitions()
}

const context: ResourceReadContext = {
  source: 'mcp',
  executionId: 'execution-a',
  requestId: 'request-a',
  tenantId: 'tenant-a',
  principal: { type: 'user', id: 'user-a' },
  host: {},
  resourceUri: 'test://items/1'
}

describe('decorated MCP methods', () => {
  it('collects all surfaces and binds handlers to the provider with the caller context', async () => {
    const catalog = await definitions(new Provider())
    expect(catalog.tools).toHaveLength(1)
    expect(catalog.resources).toHaveLength(1)
    expect(catalog.resourceTemplates).toHaveLength(1)
    expect(catalog.prompts).toHaveLength(1)
    expect(await catalog.resources[0].read(context)).toEqual({
      contents: [{ uri: context.resourceUri, text: 'from-instance:tenant-a' }]
    })
    expect(await catalog.resourceTemplates[0].read({ id: '1' }, context)).toEqual({
      contents: [{ uri: context.resourceUri, text: 'from-instance:1' }]
    })
    expect(await catalog.prompts[0].get({ goal: 'edit' }, context)).toEqual({
      messages: [{ role: 'user', content: { type: 'text', text: 'from-instance:edit:tenant-a' } }]
    })
  })

  it('inherits decorated methods, respects overrides and never calls getters during discovery', async () => {
    class Child extends Provider {
      get unrelated() {
        throw new Error('must not execute')
      }
      override resource() {
        return { contents: [] }
      }
      @XpertPrompt({ key: 'replacement', name: 'replacement' })
      override prompt() {
        return { messages: [] }
      }
    }
    const catalog = await definitions(new Child())
    expect(catalog.tools).toHaveLength(1)
    expect(catalog.resources).toHaveLength(0)
    expect(catalog.resourceTemplates).toHaveLength(1)
    expect(catalog.prompts.map((item) => item.key)).toEqual(['replacement'])
  })

  it('supports a provider with only resource or prompt methods', async () => {
    @XpertToolProvider({ provider: 'resources', componentKey: 'resources', name: 'Resources' })
    class Resources {
      @XpertResource({ key: 'info', uri: 'test://info' })
      read() {
        return { contents: [] }
      }
    }
    expect(describeXpertToolProvider(new Resources()).tools).toHaveLength(0)
    expect((await definitions(new Resources())).resources).toHaveLength(1)
  })

  it('rejects duplicate declarations and collisions with legacy extensions', async () => {
    class Duplicate extends Provider {
      @XpertResource({ key: 'overview', uri: 'test://other' })
      duplicate() {
        return { contents: [] }
      }
    }
    await expect(definitions(new Duplicate())).rejects.toThrow(/duplicate|more than once/i)
    class Legacy extends Provider {
      getMcpExtensions() {
        return { resources: [{ key: 'overview', uri: 'test://other', read: () => ({ contents: [] }) }] }
      }
    }
    await expect(definitions(new Legacy())).rejects.toThrow(/duplicate|more than once/i)
  })

  it('binds completion handlers and validates the referenced method', async () => {
    class Completion extends Provider {
      @XpertPrompt({ key: 'plan', name: 'plan', completionMethod: 'completeGoal' })
      override prompt() {
        return { messages: [] }
      }
      completeGoal() {
        return { values: [this.value] }
      }
    }
    const catalog = await definitions(new Completion())
    expect(await catalog.prompts[0].complete({ argument: 'goal', value: '' }, context)).toEqual({
      values: ['from-instance']
    })
    class Missing extends Provider {
      @XpertPrompt({ key: 'plan', name: 'plan', completionMethod: 'missing' })
      override prompt() {
        return { messages: [] }
      }
    }
    expect(() => describeXpertToolProvider(new Missing())).toThrow('not callable')
  })

  it('preserves non-conflicting legacy extensions alongside decorators', async () => {
    class Legacy extends Provider {
      getMcpExtensions() {
        return { resources: [{ key: 'legacy', uri: 'test://legacy', read: () => ({ contents: [] }) }] }
      }
    }
    const catalog = await definitions(new Legacy())
    expect(catalog.resources.map((item) => item.key)).toEqual(['legacy', 'overview'])
  })

  it('includes decorated declarations in component fingerprints', () => {
    class Changed extends Provider {
      @XpertResource({ key: 'overview', uri: 'test://new-overview' })
      override resource() {
        return { contents: [] }
      }
    }
    expect(runtimeToolProviderComponent(new Changed()).definitionHash).not.toBe(
      runtimeToolProviderComponent(new Provider()).definitionHash
    )
  })
})
