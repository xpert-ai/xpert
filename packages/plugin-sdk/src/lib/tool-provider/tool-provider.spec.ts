import { z } from 'zod/v3'
import { Reflector } from '@nestjs/core'
import { DecoratedAgentMiddlewareStrategy, DecoratedToolsetStrategy } from './adapters'
import { XpertTool, XpertToolProvider } from './decorators'
import { describeXpertToolProvider } from './descriptor'
import { XpertToolProviderRegistry } from './registry'
import type { IAgentMiddlewareContext } from '../agent/middleware/strategy.interface'
import type { ToolExecutionContext } from '../toolset/tool-execution-context'

const inputSchema = z.object({ value: z.string() }).strict()
const outputSchema = z.object({ value: z.string(), surface: z.enum(['middleware', 'mcp']) }).strict()
const mcp = {
  behavior: { risk: 'read', sideEffect: 'none', idempotency: 'safe' } as const,
  requiredContext: ['tenant', 'organization', 'principal', 'execution'] as const,
  visibility: ['model'] as const
}
const dashboardApp = {
  key: 'decorated_dashboard',
  entry: 'dist/mcp-apps/dashboard/index.html',
  title: 'Decorated dashboard',
  description: 'Interactive result for the decorated test Tool.',
  csp: { connectDomains: [], resourceDomains: [] }
}

@XpertToolProvider({
  provider: 'decorated_test',
  componentKey: 'decorated-test',
  name: 'Decorated test',
  apps: [dashboardApp],
  defaultMiddleware: 'default_group',
  middlewares: [
    { provider: 'default_group', meta: middlewareMeta('default_group') },
    { provider: 'alternate_group', meta: middlewareMeta('alternate_group') }
  ]
})
class DecoratedTestProvider {
  readonly contexts: Array<{ surface: string; tenantId: string; organizationId?: string | null; principalId: string }> =
    []

  @XpertTool({
    name: 'default_tool',
    description: 'Default grouped Tool.',
    inputSchema,
    outputSchema,
    middleware: true,
    mcp: {
      ...mcp,
      visibility: ['model', 'app'],
      app: { resourceKey: dashboardApp.key }
    }
  })
  executeDefault(input: { value: string }, context: Parameters<DecoratedTestProvider['record']>[1]) {
    return this.record(input, context)
  }

  @XpertTool({
    name: 'alternate_tool',
    description: 'Alternate grouped Tool.',
    inputSchema,
    outputSchema,
    middleware: 'alternate_group',
    mcp
  })
  executeAlternate(input: { value: string }, context: Parameters<DecoratedTestProvider['record']>[1]) {
    return this.record(input, context)
  }

  private record(
    input: { value: string },
    context: {
      surface: 'middleware' | 'mcp'
      tenantId: string
      organizationId?: string | null
      principal: { id: string }
    }
  ) {
    this.contexts.push({
      surface: context.surface,
      tenantId: context.tenantId,
      organizationId: context.organizationId,
      principalId: context.principal.id
    })
    return { value: input.value, surface: context.surface }
  }
}

describe('decorated business Tool adapters', () => {
  it('binds class and method metadata into multiple Middleware groups', async () => {
    const provider = new DecoratedTestProvider()
    const descriptor = describeXpertToolProvider(provider)
    expect(descriptor.tools.map(({ options }) => options.name).sort()).toEqual(['alternate_tool', 'default_tool'])

    const defaultStrategy = new DecoratedAgentMiddlewareStrategy(provider, descriptor, 'default_group')
    const alternateStrategy = new DecoratedAgentMiddlewareStrategy(provider, descriptor, 'alternate_group')
    const defaultMiddleware = await defaultStrategy.createMiddleware(
      {},
      middlewareContext('tenant-a', 'org-a', 'user-a')
    )
    const alternateMiddleware = await alternateStrategy.createMiddleware(
      {},
      middlewareContext('tenant-b', 'org-b', 'user-b')
    )

    expect(defaultStrategy.getToolNames()).toEqual(['default_tool'])
    expect(alternateStrategy.getToolNames()).toEqual(['alternate_tool'])
    expect(defaultMiddleware.tools?.map((tool) => Reflect.get(tool, 'name'))).toEqual(['default_tool'])
    expect(alternateMiddleware.tools?.map((tool) => Reflect.get(tool, 'name'))).toEqual(['alternate_tool'])
    await defaultMiddleware.tools?.[0]?.invoke({ value: 'agent' })
    expect(provider.contexts.at(-1)).toEqual({
      surface: 'middleware',
      tenantId: 'tenant-a',
      organizationId: 'org-a',
      principalId: 'user-a'
    })
  })

  it('creates MCP definitions with call-time context and structured DTO output', async () => {
    const provider = new DecoratedTestProvider()
    const toolset = await new DecoratedToolsetStrategy(provider, 'plugin-test', '1.0.0').create({
      name: 'Decorated'
    })
    const definition = toolset.getMcpCapabilityDefinitions()?.tools?.find(({ name }) => name === 'default_tool')
    const result = await definition?.execute(
      { value: 'mcp-value' },
      mcpContext('tenant-runtime', 'org-runtime', 'principal-runtime')
    )

    expect(result?.structuredContent).toEqual({ value: 'mcp-value', surface: 'mcp' })
    expect(definition?.app).toEqual({ resourceKey: dashboardApp.key })
    expect(definition?.visibility).toEqual(['model', 'app'])
    expect(toolset.getMcpCapabilityDefinitions()?.apps).toEqual([dashboardApp])
    expect(provider.contexts).toEqual([
      {
        surface: 'mcp',
        tenantId: 'tenant-runtime',
        organizationId: 'org-runtime',
        principalId: 'principal-runtime'
      }
    ])
    expect(await toolset.initTools()).toEqual([])
  })

  it('rejects unknown input fields and invalid business output', async () => {
    const provider = new DecoratedTestProvider()
    const toolset = await new DecoratedToolsetStrategy(provider).create({ name: 'Decorated' })
    const definition = toolset.getMcpCapabilityDefinitions()?.tools?.[0]

    await expect(
      definition?.execute(
        { value: 'valid', organizationId: 'model-controlled' },
        mcpContext('tenant', 'org', 'principal')
      )
    ).rejects.toThrow()

    @XpertToolProvider({ provider: 'invalid_runtime', componentKey: 'invalid-runtime', name: 'Invalid runtime' })
    class InvalidRuntimeProvider {
      @XpertTool({
        name: 'invalid_runtime_tool',
        description: 'Returns a DTO that violates its schema.',
        inputSchema,
        outputSchema,
        middleware: false,
        mcp
      })
      execute() {
        return { value: 42 }
      }
    }
    const invalidToolset = await new DecoratedToolsetStrategy(new InvalidRuntimeProvider()).create({
      name: 'Invalid runtime'
    })
    const invalidDefinition = invalidToolset.getMcpCapabilityDefinitions()?.tools?.[0]
    await expect(
      invalidDefinition?.execute({ value: 'valid' }, mcpContext('tenant', 'org', 'principal'))
    ).rejects.toThrow()
  })

  it('rejects non-strict MCP output schemas', () => {
    @XpertToolProvider({ provider: 'invalid_output', componentKey: 'invalid-output', name: 'Invalid' })
    class InvalidOutputProvider {
      @XpertTool({
        name: 'invalid_tool',
        description: 'Invalid output schema.',
        inputSchema,
        outputSchema: z.object({ value: z.string() }).passthrough(),
        middleware: false,
        mcp
      })
      execute() {
        return { value: 'ok' }
      }
    }

    expect(() => describeXpertToolProvider(new InvalidOutputProvider())).toThrow(/output schema must be a strict/)
  })

  it('rejects missing App declarations and bindings without app visibility', () => {
    @XpertToolProvider({ provider: 'missing_app', componentKey: 'missing-app', name: 'Missing App' })
    class MissingAppProvider {
      @XpertTool({
        name: 'missing_app_tool',
        description: 'References an App that is not declared by the Provider.',
        inputSchema,
        outputSchema,
        middleware: false,
        mcp: { ...mcp, visibility: ['model', 'app'], app: { resourceKey: 'not_declared' } }
      })
      execute(input: { value: string }) {
        return { value: input.value, surface: 'mcp' as const }
      }
    }

    @XpertToolProvider({
      provider: 'hidden_app',
      componentKey: 'hidden-app',
      name: 'Hidden App',
      apps: [dashboardApp]
    })
    class HiddenAppProvider {
      @XpertTool({
        name: 'hidden_app_tool',
        description: 'Incorrectly omits app visibility.',
        inputSchema,
        outputSchema,
        middleware: false,
        mcp: { ...mcp, app: { resourceKey: dashboardApp.key } }
      })
      execute(input: { value: string }) {
        return { value: input.value, surface: 'mcp' as const }
      }
    }

    expect(() => describeXpertToolProvider(new MissingAppProvider())).toThrow(/undeclared App 'not_declared'/)
    expect(() => describeXpertToolProvider(new HiddenAppProvider())).toThrow(/must include app visibility/)
  })

  it('rejects component and Tool claims that conflict in the same runtime scope', () => {
    const registry = new XpertToolProviderRegistry({ getProviders: () => [] } as never, new Reflector())
    registry.upsert(new DecoratedTestProvider())

    @XpertToolProvider({ provider: 'component_conflict', componentKey: 'decorated-test', name: 'Conflict' })
    class ComponentConflictProvider {
      @XpertTool({
        name: 'unique_tool',
        description: 'Unique Tool with a conflicting component.',
        inputSchema,
        outputSchema,
        middleware: false,
        mcp
      })
      execute(input: { value: string }) {
        return { value: input.value, surface: 'mcp' as const }
      }
    }

    @XpertToolProvider({ provider: 'tool_conflict', componentKey: 'tool-conflict', name: 'Conflict' })
    class ToolConflictProvider {
      @XpertTool({
        name: 'default_tool',
        description: 'Conflicting Tool name.',
        inputSchema,
        outputSchema,
        middleware: false,
        mcp
      })
      execute(input: { value: string }) {
        return { value: input.value, surface: 'mcp' as const }
      }
    }

    expect(() => registry.upsert(new ComponentConflictProvider())).toThrow(/Component key 'decorated-test'/)
    expect(() => registry.upsert(new ToolConflictProvider())).toThrow(/Tool 'default_tool'/)
    expect(registry.list()).toEqual([expect.any(DecoratedTestProvider)])
  })
})

function middlewareMeta(name: string) {
  return {
    name,
    label: { en_US: name, zh_Hans: name },
    configSchema: { type: 'object' as const, properties: {}, required: [] }
  }
}

function middlewareContext(tenantId: string, organizationId: string, userId: string): IAgentMiddlewareContext {
  return {
    tenantId,
    organizationId,
    userId,
    node: {} as IAgentMiddlewareContext['node'],
    tools: new Map(),
    runtime: {
      createModelClient: jest.fn(),
      getModelProvider: jest.fn()
    } as unknown as IAgentMiddlewareContext['runtime']
  }
}

function mcpContext(tenantId: string, organizationId: string, principalId: string): ToolExecutionContext {
  return {
    source: 'mcp',
    tenantId,
    organizationId,
    principal: { type: 'user', id: principalId, userId: principalId },
    executionId: 'execution',
    requestId: 'request',
    host: {}
  }
}
