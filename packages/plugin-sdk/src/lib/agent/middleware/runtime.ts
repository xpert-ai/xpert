/* eslint-disable @typescript-eslint/no-explicit-any */
import { Embeddings } from '@langchain/core/embeddings'
import { BaseLanguageModel } from '@langchain/core/language_models/base'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { Runtime as LangGraphRuntime, PregelOptions, StreamMode } from '@langchain/langgraph'
import type { BaseMessage } from '@langchain/core/messages'
import {
  ICopilotModel,
  IModelAccessResolution,
  IXpertAgentExecution,
  JSONValue,
  ModelUsagePricingSnapshot,
  ModelUsageReport,
  ModelUsageReportResult,
  ModelUsagePricingContext,
  TSandboxConfigurable
} from '@xpert-ai/contracts'
import { Subscriber } from 'rxjs'
import { AIGCModelClient, AsyncAIGCModelClient, IRerank, TLLMUsage } from '../../ai-model/types'
import type { RuntimeCapabilityRegistry } from '../../core'

export * from './runtime-capability'
export * from './capabilities'

/**
 * Type for the agent's built-in state properties.
 */
export type AgentBuiltInState = {
  /**
   * Array of messages representing the conversation history.
   *
   * This includes all messages exchanged during the agent's execution:
   * - Human messages: Input from the user
   * - AI messages: Responses from the language model
   * - Tool messages: Results from tool executions
   * - System messages: System-level instructions or information
   *
   * Messages are accumulated throughout the agent's lifecycle and can be
   * accessed or modified by middleware hooks during execution.
   */
  messages: BaseMessage[]
  /**
   * Structured response data returned by the agent when a `responseFormat` is configured.
   *
   * This property is only populated when you provide a `responseFormat` schema
   * (as Zod or JSON schema) to the agent configuration. The agent will format
   * its final output to match the specified schema and store it in this property.
   *
   * Note: The type is specified as `Record<string, unknown>` because TypeScript cannot
   * infer the actual response format type in contexts like middleware, where the agent's
   * generic type parameters are not accessible. You may need to cast this to your specific
   * response type when accessing it.
   */
  structuredResponse?: Record<string, unknown>
}

/**
 * Type helper to check if TContext is an optional Zod schema
 */
type IsOptionalZodObject<T> = T extends any ? true : false
type IsDefaultZodObject<T> = T extends any ? true : false

export type WithMaybeContext<TContext> = undefined extends TContext
  ? { readonly context?: TContext }
  : IsOptionalZodObject<TContext> extends true
    ? { readonly context?: TContext }
    : IsDefaultZodObject<TContext> extends true
      ? { readonly context?: TContext }
      : { readonly context: TContext }

/**
 * Runtime information available to middleware (readonly).
 */
export type Runtime<TContext = unknown> = Partial<Omit<LangGraphRuntime<TContext>, 'context' | 'configurable'>> &
  WithMaybeContext<TContext> & {
    configurable?: {
      thread_id?: string
      sandbox?: TSandboxConfigurable | null
      [key: string]: unknown
    }
  }

export type AgentMiddlewareModelClient =
  | BaseLanguageModel
  | BaseChatModel
  | Embeddings
  | IRerank
  | AIGCModelClient
  | AsyncAIGCModelClient

export type AgentMiddlewareCreateModelClientOptions = {
  abortController?: AbortController
  usageCallback?: (tokens: TLLMUsage) => void | Promise<void>
  /** `observe` reads an existing asynchronous task and must not consume generation quota. */
  purpose?: 'invoke' | 'observe'
}

export type AgentMiddlewareModelAccessContext = ModelUsagePricingContext & {
  requestId: string
}

export type AgentMiddlewareModelProviderConnection = {
  /** Stable host-owned model provider configuration boundary. */
  providerScopeId: string
  /** Host-owned Copilot identity used for usage accounting. */
  copilotId?: string
  /** Ownership scope of the resolved Provider configuration. */
  organizationId?: string | null
  provider: string
  baseURL: string
  authorization: string
  /** Resolve and freeze the host-owned Direct/Grant access decision before provider invocation. */
  resolveModelAccess?: (context: AgentMiddlewareModelAccessContext) => Promise<IModelAccessResolution>
  /** Resolve the model YAML price rule and freeze it for one invocation. */
  resolvePricingSnapshot?: (context: ModelUsagePricingContext) => Promise<ModelUsagePricingSnapshot>
  /** Persist final authoritative usage and calculate its charge exactly once. */
  reportUsage(report: ModelUsageReport, modelAccess?: IModelAccessResolution): Promise<ModelUsageReportResult>
}

export type AgentMiddlewareRuntimeScope = {
  tenantId?: string | null
  organizationId?: string | null
  providerScopeId?: string | null
  userId?: string | null
  workspaceId?: string | null
  projectId?: string | null
  xpertId?: string | null
  xpertName?: string | null
  conversationId?: string | null
  agentKey?: string | null
  executionId?: string | null
  usageCallback?: (usage: TLLMUsage) => void | Promise<void>
  workspaceRoot?: string | null
  workspacePath?: string | null
}

export interface AgentMiddlewareRuntimeServiceApi {
  createScopedApi(scope?: AgentMiddlewareRuntimeScope): AgentMiddlewareRuntimeApi
}

export const XPERT_AGENT_MIDDLEWARE_RUNTIME_TOKEN = 'XPERT_AGENT_MIDDLEWARE_RUNTIME'

export type AgentMiddlewareWrapWorkflowNodeExecutionResult<T> = {
  output?: string | JSONValue
  state: T
}

export type AgentMiddlewareWrapWorkflowNodeExecutionParams = {
  execution: Partial<IXpertAgentExecution>
  subscriber?: Subscriber<MessageEvent>
  catchError?: (error: Error) => Promise<void>
}

export type AgentMiddlewareEventStatus = 'running' | 'success' | 'fail'

export type AgentMiddlewareEvent = {
  type?: 'middleware_event'
  middlewareName?: string
  middlewareKey?: string
  title?: string
  message?: string
  status?: AgentMiddlewareEventStatus
  phase?: string
  executionId?: string
  threadId?: string
  created_date?: string
  end_date?: string
  error?: unknown
  data?: unknown
  [key: string]: unknown
}

export interface AgentMiddlewareRuntimeApi {
  createModelClient<T = AgentMiddlewareModelClient>(
    copilotModel: ICopilotModel,
    options: AgentMiddlewareCreateModelClientOptions
  ): Promise<T>

  /** Resolve an enabled model provider connection in the current tenant and organization scope. */
  getModelProvider?(provider: string): Promise<AgentMiddlewareModelProviderConnection>

  wrapWorkflowNodeExecution<T>(
    run: (execution: Partial<IXpertAgentExecution>) => Promise<AgentMiddlewareWrapWorkflowNodeExecutionResult<T>>,
    params: AgentMiddlewareWrapWorkflowNodeExecutionParams
  ): Promise<T>

  emitMiddlewareEvent?(event: AgentMiddlewareEvent): Promise<void> | void

  capabilities?: RuntimeCapabilityRegistry
}
