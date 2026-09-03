import type { RunnableConfig } from '@langchain/core/runnables'
import { tool, type DynamicStructuredTool, type StructuredToolInterface } from '@langchain/core/tools'
import type { I18nObject, IXpertToolset } from '@xpert-ai/contracts'
import type { ZodSchema } from 'zod/v3'
import type { IAgentMiddlewareContext, IAgentMiddlewareStrategy } from '../agent/middleware/strategy.interface'
import type { AgentMiddleware } from '../agent/middleware/types'
import type { McpCapabilityDefinitions } from '../mcp/runtime'
import { BuiltinToolset, type TBuiltinToolsetParams } from '../toolset/builtin'
import type { AnyXpertToolDefinition } from '../toolset/define-tool'
import type { IToolsetStrategy } from '../toolset/strategy.interface'
import type { ToolExecutionContext } from '../toolset/tool-execution-context'
import { describeXpertToolProvider, getXpertToolMethod } from './descriptor'
import type {
  XpertBusinessToolContext,
  XpertDecoratedToolDescriptor,
  XpertToolProviderDescriptor,
  XpertToolProviderInstance
} from './types'

export class DecoratedToolsetStrategy implements IToolsetStrategy<IXpertToolset> {
  readonly descriptor: XpertToolProviderDescriptor
  readonly meta: IToolsetStrategy<IXpertToolset>['meta']

  constructor(
    private readonly instance: XpertToolProviderInstance,
    private readonly pluginName?: string,
    private readonly pluginVersion?: string
  ) {
    this.descriptor = describeXpertToolProvider(instance)
    const options = this.descriptor.options
    this.meta = {
      author: options.author ?? 'Plugin',
      tags: [...(options.tags ?? ['mcp'])],
      name: options.provider,
      label: options.label ?? asI18n(options.name),
      ...(options.description ? { description: asI18n(options.description) } : {}),
      configSchema: options.configSchema ?? { type: 'object', properties: {}, required: [] },
      ...(options.icon ? { icon: options.icon } : {})
    }
  }

  validateConfig(): Promise<void> {
    return Promise.resolve()
  }

  async create(toolset: IXpertToolset, params?: TBuiltinToolsetParams): Promise<BuiltinToolset> {
    return new DecoratedBuiltinToolset(
      this.instance,
      this.descriptor,
      toolset,
      params,
      this.pluginName,
      this.pluginVersion
    )
  }

  createTools(): DynamicStructuredTool<ZodSchema>[] {
    return []
  }
}

export class DecoratedAgentMiddlewareStrategy implements IAgentMiddlewareStrategy<unknown> {
  readonly meta

  constructor(
    private readonly instance: XpertToolProviderInstance,
    private readonly descriptor: XpertToolProviderDescriptor,
    readonly provider: string
  ) {
    const definition = descriptor.options.middlewares?.find((item) => item.provider === provider)
    if (!definition) throw new Error(`Middleware provider '${provider}' is not declared.`)
    this.meta = definition.meta
  }

  async createMiddleware(options: unknown, context: IAgentMiddlewareContext): Promise<AgentMiddleware> {
    const tools = this.descriptor.tools
      .filter((item) => item.middlewareProvider === this.provider)
      .map((item) => createAgentTool(this.instance, item, context, options))
    const extensions = await this.instance.getMiddlewareExtensions?.(this.provider, options, context)
    return {
      ...(extensions ?? {}),
      name: this.provider,
      tools
    }
  }
}

class DecoratedBuiltinToolset extends BuiltinToolset<StructuredToolInterface, Record<string, never>> {
  readonly #definitions: McpCapabilityDefinitions

  constructor(
    instance: XpertToolProviderInstance,
    descriptor: XpertToolProviderDescriptor,
    toolset: IXpertToolset,
    params: TBuiltinToolsetParams | undefined,
    private readonly pluginName?: string,
    private readonly pluginVersion?: string
  ) {
    super(descriptor.options.provider, toolset, params)
    this.tools = []
    this.#definitions = {
      instructions: descriptor.options.instructions,
      tools: descriptor.tools.filter((item) => !!item.options.mcp).map((item) => createMcpTool(instance, item)),
      ...(descriptor.options.apps?.length ? { apps: [...descriptor.options.apps] } : {})
    }
  }

  override _validateCredentials(): Promise<void> {
    return Promise.resolve()
  }

  override async initTools(): Promise<StructuredToolInterface[]> {
    return this.tools
  }

  override getMcpCapabilityDefinitions() {
    return this.#definitions
  }

  override getMcpCapabilitySource() {
    return {
      ...(this.pluginName ? { pluginName: this.pluginName } : {}),
      ...(this.pluginVersion ? { pluginVersion: this.pluginVersion } : {})
    }
  }
}

function createAgentTool(
  instance: XpertToolProviderInstance,
  descriptor: XpertDecoratedToolDescriptor,
  middlewareContext: IAgentMiddlewareContext,
  middlewareOptions: unknown
) {
  const invoke = getXpertToolMethod(instance, descriptor)
  return tool(
    async (input: unknown, config: RunnableConfig) => {
      const parsedInput = await descriptor.options.inputSchema.parseAsync(input)
      const output = await invoke(parsedInput, agentExecutionContext(middlewareContext, middlewareOptions, config))
      const parsedOutput = descriptor.options.outputSchema
        ? await descriptor.options.outputSchema.parseAsync(output)
        : output
      return stringifyDto(parsedOutput, descriptor.options.name)
    },
    {
      name: descriptor.options.name,
      description: descriptor.options.description,
      schema: descriptor.options.inputSchema,
      verboseParsingErrors: true,
      ...(descriptor.options.metadata ? { metadata: descriptor.options.metadata } : {})
    }
  )
}

function createMcpTool(
  instance: XpertToolProviderInstance,
  descriptor: XpertDecoratedToolDescriptor
): AnyXpertToolDefinition {
  const mcp = descriptor.options.mcp
  const outputSchema = descriptor.options.outputSchema
  if (!mcp || !outputSchema) throw new Error(`MCP Tool '${descriptor.options.name}' is incomplete.`)
  const invoke = getXpertToolMethod(instance, descriptor)
  return {
    name: descriptor.options.name,
    ...(descriptor.options.title ? { title: descriptor.options.title } : {}),
    description: descriptor.options.description,
    inputSchema: descriptor.options.inputSchema,
    outputSchema,
    exposure: { mcp: { eligible: true } },
    behavior: mcp.behavior,
    requiredContext: [...mcp.requiredContext],
    visibility: [...(mcp.visibility ?? (mcp.app ? ['model', 'app'] : ['model']))],
    ...(mcp.app ? { app: { resourceKey: mcp.app.resourceKey } } : {}),
    execute: async (input: unknown, context: ToolExecutionContext) => {
      const parsedInput = await descriptor.options.inputSchema.parseAsync(input)
      const output = await invoke(parsedInput, mcpExecutionContext(context))
      const parsedOutput = await outputSchema.parseAsync(output)
      const dto = jsonDto(parsedOutput, descriptor.options.name)
      return {
        content: [
          {
            type: 'text',
            text: `${descriptor.options.title ?? descriptor.options.name} completed. See structuredContent for the result.`
          }
        ],
        structuredContent: dto
      }
    }
  }
}

function agentExecutionContext(
  context: IAgentMiddlewareContext,
  middlewareOptions: unknown,
  config: RunnableConfig
): XpertBusinessToolContext {
  const configurable = config.configurable
  const requestId = readString(configurable, 'tool_call_id')
  const executionId = readString(configurable, 'executionId')
  const traceId = readString(configurable, 'traceId')
  return {
    surface: 'middleware',
    tenantId: context.tenantId,
    organizationId: context.organizationId,
    principal: { type: 'user', id: context.userId, userId: context.userId },
    workspaceId: context.workspaceId,
    projectId: context.projectId,
    conversationId: context.conversationId,
    threadId: context.threadId,
    xpertId: context.xpertId,
    agentKey: context.agentKey,
    ...(executionId ? { executionId } : {}),
    ...(requestId ? { requestId } : {}),
    ...(traceId ? { traceId } : {}),
    signal: config.signal,
    host: {
      models: {
        createModelClient: context.runtime.createModelClient,
        getModelProvider: context.runtime.getModelProvider
      }
    },
    middlewareOptions
  }
}

function mcpExecutionContext(context: ToolExecutionContext): XpertBusinessToolContext {
  return {
    surface: 'mcp',
    tenantId: context.tenantId,
    organizationId: context.organizationId,
    principal: context.principal,
    workspaceId: context.workspaceId,
    projectId: context.projectId,
    conversationId: context.conversationId,
    threadId: readString(context, 'threadId'),
    xpertId: context.xpertId,
    agentKey: context.agentKey,
    executionId: context.executionId,
    requestId: context.requestId,
    traceId: context.traceId,
    signal: context.signal,
    host: context.host
  }
}

function stringifyDto(value: unknown, toolName: string) {
  const result = JSON.stringify(value)
  if (result === undefined) throw new Error(`Tool '${toolName}' returned a non-JSON value.`)
  return result
}

function jsonDto(value: unknown, toolName: string) {
  return JSON.parse(stringifyDto(value, toolName)) as unknown
}

function asI18n(value: string): I18nObject {
  return { en_US: value, zh_Hans: value }
}

function readString(value: unknown, key: string) {
  if (!value || typeof value !== 'object') return undefined
  const field = Reflect.get(value, key)
  return typeof field === 'string' && field ? field : undefined
}
