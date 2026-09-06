import { z } from 'zod/v3'
import { Reflector } from '@nestjs/core'
import { DecoratedAgentMiddlewareStrategy, DecoratedToolsetStrategy } from './adapters'
import { XpertTool, XpertToolProvider } from './decorators'
import { describeXpertToolProvider } from './descriptor'
import { prepareToolResult } from './prepared-result'
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
      defaultApprovalMode: 'allow',
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
  it('propagates the declared default policy without changing behavior metadata', async () => {
    const tools = (
      await new DecoratedToolsetStrategy(new DecoratedTestProvider(), 'test', '1').create({ name: 'Test' })
    ).getMcpCapabilityDefinitions().tools
    expect(tools.find((item) => item.name === 'default_tool')).toMatchObject({
      defaultApprovalMode: 'allow',
      behavior: mcp.behavior
    })
    expect(tools.find((item) => item.name === 'alternate_tool')).not.toHaveProperty('defaultApprovalMode')
  })

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
    expect(result?.content).toEqual([{ type: 'text', text: JSON.stringify(result.structuredContent) }])
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

@XpertToolProvider({
  provider: 'image_test',
  componentKey: 'image-test',
  name: 'Image test',
  defaultMiddleware: 'images',
  middlewares: [{ provider: 'images', meta: middlewareMeta('images') }]
})
class ImageTestProvider {
  invalid = false
  @XpertTool({
    name: 'read_image',
    description: 'Read a governed preview.',
    inputSchema: z.object({}).strict(),
    outputSchema: z.object({ drawingId: z.string() }).strict(),
    resultFormat: 'tool_result',
    middleware: true,
    mcp
  })
  read() {
    return {
      content: [{ type: 'image' as const, mimeType: 'image/png', data: 'aGVsbG8=' }],
      structuredContent: this.invalid ? { drawingId: 42 } : { drawingId: 'drawing-1' }
    }
  }
}

describe('decorated tool_result format', () => {
  it('keeps MCP image bytes out of the validated structured DTO', async () => {
    const provider = new ImageTestProvider()
    const toolset = await new DecoratedToolsetStrategy(provider, 'image-plugin', '1.0.0').create({ name: 'Images' })
    const definition = toolset.getMcpCapabilityDefinitions().tools[0]
    const result = await definition.execute({}, mcpContext('tenant', 'org', 'user'))
    expect(result).toEqual({
      content: [
        { type: 'image', mimeType: 'image/png', data: 'aGVsbG8=' },
        { type: 'text', text: '{"drawingId":"drawing-1"}' }
      ],
      structuredContent: { drawingId: 'drawing-1' }
    })
    provider.invalid = true
    await expect(definition.execute({}, mcpContext('tenant', 'org', 'user'))).rejects.toThrow()
  })
  it('delivers images to Agent vision and preserves a compact artifact', async () => {
    const provider = new ImageTestProvider()
    const strategy = new DecoratedAgentMiddlewareStrategy(provider, describeXpertToolProvider(provider), 'images')
    const middleware = await strategy.createMiddleware({}, middlewareContext('tenant', 'org', 'user'))
    const result = await middleware.tools[0].invoke({
      type: 'tool_call',
      id: 'image-call',
      name: 'read_image',
      args: {}
    })
    expect(result.content).toEqual(
      expect.arrayContaining([{ type: 'image_url', image_url: { url: 'data:image/png;base64,aGVsbG8=' } }])
    )
    expect(result.artifact.structuredContent).toEqual({ drawingId: 'drawing-1' })
  })
})

it('accepts strict object refinements and enforces them at invocation', async () => {
  @XpertToolProvider({ provider: 'refined_test', componentKey: 'refined-test', name: 'Refined' })
  class Refined {
    @XpertTool({
      name: 'refined_tool',
      description: 'Requires an ordered range.',
      inputSchema: z
        .object({ start: z.number(), end: z.number() })
        .strict()
        .refine((value) => value.start < value.end),
      outputSchema: z.object({ ok: z.boolean() }).strict(),
      middleware: false,
      mcp
    })
    run() {
      return { ok: true }
    }
  }
  const toolset = await new DecoratedToolsetStrategy(new Refined(), 'test', '1').create({ name: 'Refined' })
  const definition = toolset.getMcpCapabilityDefinitions().tools[0]
  await expect(definition.execute({ start: 2, end: 1 }, mcpContext('tenant', 'org', 'user'))).rejects.toThrow()
  expect(
    (await definition.execute({ start: 1, end: 2 }, mcpContext('tenant', 'org', 'user'))).structuredContent
  ).toEqual({ ok: true })
})

const recoveredOutput = z.union([
  z.object({ success: z.boolean(), label: z.string() }).strict(),
  z.object({ resultStatus: z.literal('unavailable'), success: z.boolean(), operationId: z.string() }).strict()
])
@XpertToolProvider({
  provider: 'recover_test',
  componentKey: 'recover-test',
  name: 'Recovery',
  defaultMiddleware: 'recovery',
  middlewares: [{ provider: 'recovery', meta: middlewareMeta('recovery') }]
})
class RecoveryProvider {
  commits = 0
  denied = false
  @XpertTool({
    name: 'recover_write',
    description: 'Write then prepare its result.',
    inputSchema: z.object({}).strict(),
    outputSchema: recoveredOutput,
    middleware: true,
    mcp
  })
  write() {
    if (this.denied) throw new Error('authorization_denied')
    this.commits++
    return prepareToolResult(
      () => ({ success: true, label: 42 }),
      () => ({ resultStatus: 'unavailable' as const, success: true, operationId: 'op' })
    )
  }
}
it('returns a schema-valid receipt on both surfaces without rerunning the completed write', async () => {
  const provider = new RecoveryProvider()
  const toolset = await new DecoratedToolsetStrategy(provider).create({ name: 'Recovery' })
  const definition = toolset.getMcpCapabilityDefinitions().tools[0]
  const result = await definition.execute({}, mcpContext('tenant', 'org', 'user'))
  expect(result.structuredContent).toEqual({ resultStatus: 'unavailable', success: true, operationId: 'op' })
  expect(result.content).toEqual([{ type: 'text', text: JSON.stringify(result.structuredContent) }])
  expect(result.isError).not.toBe(true)
  expect(provider.commits).toBe(1)
  const strategy = new DecoratedAgentMiddlewareStrategy(provider, describeXpertToolProvider(provider), 'recovery')
  const middleware = await strategy.createMiddleware({}, middlewareContext('tenant', 'org', 'user'))
  expect(JSON.parse(await middleware.tools[0].invoke({}))).toMatchObject({
    resultStatus: 'unavailable',
    operationId: 'op'
  })
  expect(provider.commits).toBe(2)
  provider.denied = true
  await expect(definition.execute({}, mcpContext('tenant', 'org', 'user'))).rejects.toThrow('authorization_denied')
  expect(provider.commits).toBe(2)
})
it('requires every output recovery union branch to be a strict object', () => {
  @XpertToolProvider({ provider: 'invalid_union', componentKey: 'invalid-union', name: 'Invalid' })
  class Invalid {
    @XpertTool({
      name: 'invalid_union',
      description: 'Invalid recovery declaration.',
      inputSchema: z.object({}).strict(),
      outputSchema: z.union([z.object({ ok: z.boolean() }).strict(), z.object({ value: z.string() })]),
      mcp
    })
    run() {
      return { ok: true }
    }
  }
  expect(() => describeXpertToolProvider(new Invalid())).toThrow('strict Zod object')
})
