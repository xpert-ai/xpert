import type {
  IconDefinition,
  I18nObject,
  JsonSchemaObjectType,
  McpRequiredContext,
  McpToolBehavior,
  TAgentMiddlewareMeta
} from '@xpert-ai/contracts'
import type { RunnableConfig } from '@langchain/core/runnables'
import type { ZodTypeAny, infer as ZodInfer } from 'zod/v3'
import type { AgentMiddleware } from '../agent/middleware/types'
import type { IAgentMiddlewareContext } from '../agent/middleware/strategy.interface'
import type { McpAppDefinition } from '../mcp/app'
import type { ToolExecutionContext, ToolHostApi, ToolPrincipal } from '../toolset/tool-execution-context'
import type { XpertToolAppBinding, XpertToolVisibility } from '../toolset/define-tool'
import type { PromiseOrValue } from '../types'

export type XpertBusinessToolSurface = 'middleware' | 'mcp'

export interface XpertToolProviderMiddlewareDefinition {
  provider: string
  meta: TAgentMiddlewareMeta
}

export interface XpertToolProviderOptions {
  /** Stable Builtin Toolset provider key. */
  provider: string
  /** Stable plugin resource identity. */
  componentKey: string
  /** Human-readable MCP service name. */
  name: string
  description?: string
  instructions?: string
  /**
   * Legacy display hint. The host owns the public Publication slug and derives it from
   * artifactNamespace, provider, and plugin scope.
   * @deprecated Do not couple Provider definitions to a client or public endpoint name.
   */
  slug?: string
  author?: string
  tags?: string[]
  label?: I18nObject
  icon?: IconDefinition
  configSchema?: JsonSchemaObjectType
  defaultMiddleware?: string
  middlewares?: readonly XpertToolProviderMiddlewareDefinition[]
  /** Static MCP App bundles published with this host-native Provider. */
  apps?: readonly McpAppDefinition[]
}

export interface XpertMcpToolOptions {
  behavior: McpToolBehavior
  requiredContext: readonly McpRequiredContext[]
  visibility?: readonly XpertToolVisibility[]
  /** Associates this Tool with one App declared by the owning Provider. */
  app?: XpertToolAppBinding
}

export interface XpertToolOptions<
  TInputSchema extends ZodTypeAny = ZodTypeAny,
  TOutputSchema extends ZodTypeAny = ZodTypeAny
> {
  name: string
  title?: string
  description: string
  inputSchema: TInputSchema
  outputSchema?: TOutputSchema
  /** true uses the class default, a string selects a declared group, false disables Middleware exposure. */
  middleware?: true | string | false
  /** MCP exposure is opt-in. */
  mcp?: XpertMcpToolOptions | false
  /** LangChain Tool metadata used only on the Agent Middleware surface. */
  metadata?: Record<string, unknown>
}

export interface XpertBusinessToolContext {
  surface: XpertBusinessToolSurface
  tenantId: string
  organizationId?: string | null
  principal: ToolPrincipal
  workspaceId?: string
  projectId?: string
  conversationId?: string
  threadId?: string
  xpertId?: string
  agentKey?: string
  executionId?: string
  requestId?: string
  traceId?: string
  signal?: AbortSignal
  host: ToolHostApi
  middlewareOptions?: unknown
}

export type XpertDecoratedToolMethod<
  TInputSchema extends ZodTypeAny = ZodTypeAny,
  TOutputSchema extends ZodTypeAny = ZodTypeAny
> = (input: ZodInfer<TInputSchema>, context: XpertBusinessToolContext) => PromiseOrValue<ZodInfer<TOutputSchema>>

export interface XpertToolProviderInstance {
  getMiddlewareExtensions?(
    provider: string,
    options: unknown,
    context: IAgentMiddlewareContext
  ): PromiseOrValue<Omit<AgentMiddleware, 'name' | 'tools'>>
}

export interface XpertDecoratedToolDescriptor {
  methodName: string
  middlewareProvider?: string
  options: Readonly<XpertToolOptions>
}

export interface XpertToolProviderDescriptor {
  options: Readonly<XpertToolProviderOptions>
  tools: readonly XpertDecoratedToolDescriptor[]
}

export interface XpertAgentToolRunnableConfig extends RunnableConfig {
  configurable?: RunnableConfig['configurable'] & {
    tool_call_id?: string
    executionId?: string
    traceId?: string
  }
}

export type XpertMcpExecutionContext = ToolExecutionContext
