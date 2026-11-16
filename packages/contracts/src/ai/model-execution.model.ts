import { z } from 'zod/v3'
import type { AiModelTypeEnum } from '../agent'
import type { ModelFeature } from './ai-model.model'
import type { ModelExecutionParameters } from './model-execution-parameters.model'
import type { CliPermissionMode } from './cli-execution.model'
import type {
  ExecutionSourceContext,
  ExecutionSource as ModelExecutionSource,
  ExecutionEnvironment as ModelExecutionEnvironment
} from './execution-source.model'

// Retain existing public names while source contracts remain independent of model execution.
export type {
  ExecutionSource as ModelExecutionSource,
  ExecutionEnvironment as ModelExecutionEnvironment
} from './execution-source.model'

/** Entry point and execution location are independent dimensions. */
export type ModelExecutionEntry = 'cli' | 'agent_runtime' | 'shell'
export type ModelExecutionProtocol =
  | 'openai_chat'
  | 'openai_responses'
  | 'anthropic_messages'
  | 'openai_responses_chat'
  | 'anthropic_messages_chat'

/** Exhaustive attribution shared by queries, ledger export and UI. */
export function modelExecutionEntry(source: ModelExecutionSource): ModelExecutionEntry {
  switch (source.type) {
    case 'cli_session':
      return 'cli'
    case 'agent_invocation':
      return 'agent_runtime'
    case 'shell_execution':
      return 'shell'
  }
}
export function modelExecutionSourceId(source: ModelExecutionSource): string {
  switch (source.type) {
    case 'cli_session':
      return source.cliSessionId
    case 'agent_invocation':
      return source.invocationId
    case 'shell_execution':
      return source.executionId
  }
}

export interface ModelExecutionModel {
  id: string
  copilotId: string
  providerScopeId: string
  providerOrganizationId: string | null
  provider: string
  model: string
  modelType: AiModelTypeEnum.LLM
  capabilities: ModelFeature[]
  /** Validated non-secret Assistant parameters frozen at grant issuance; absent on legacy grants. */
  parameters?: ModelExecutionParameters
  /** Provider catalog context window; a CLI hint, not an execution policy limit. */
  contextWindow?: number
  /** Provider catalog maximum output; a CLI hint, never an additional execution cap. */
  outputTokenLimit?: number
  protocols: ModelExecutionProtocol[]
}

/** Platform model calls add billing to the shared execution identity. */
export interface ModelExecutionContext extends ExecutionSourceContext {
  billableUserId: string
}

/** Money limits require proven provider-specific bounds; v1 admits token budgets only. */
export interface ModelExecutionLimits {
  /** Optional execution budgets; omitted uses the platform’s normal billing/quota. */
  tokenBudget?: number
  userTokenBudget?: number
  maxConcurrentRequests: number
  requestsPerMinute: number
  /** Maximum silence while waiting for provider data; active streams reset this timer. */
  requestIdleSeconds?: number
  leaseSeconds: number
  maxDurationSeconds: number
}

/** Resolved execution policy; default enablement does not bypass model, tool or budget checks. */
export type ModelExecutionPolicy = {
  /** @deprecated Compatibility field, always true; no longer a tenant opt-in switch. */
  enabled: true
  gatewayBaseUrl: string
  /** Defaults to native Responses; explicit lists (including []) override it. Native Messages remains opt-in. */
  nativeProtocols?: Array<'openai_responses' | 'anthropic_messages'>
  /** Explicit, limited Chat Completions translations; never advertised as native support. */
  chatBridgeProtocols?: Array<'openai_responses' | 'anthropic_messages'>
  limits: ModelExecutionLimits
  /** Default for new executions without a host override; limits.maxDurationSeconds remains the ceiling. */
  defaultDurationSeconds?: number
  /** Background Coding and Computer Codex launches; evidence-only reviews remain restricted. */
  cliPermissions?: { defaultMode: CliPermissionMode; overrides: Record<string, CliPermissionMode> }
  /** Only installed, registered profiles qualify; IDs alone never authorize execution. */
  tools: Array<{ id: string; version: string; executable: string }>
}

export const MODEL_EXECUTION_POLICY_SETTING = 'modelExecutionPolicy'

/** Attribution snapshot persisted with execution usage; contains no authorization credentials. */
export interface ModelExecutionUsageContext {
  /** CLI or managed runtime entry point, independent of the execution environment. */
  entry: ModelExecutionEntry
  /** Bound execution location and instance/revision, not the model provider's location. */
  environment: ModelExecutionEnvironment
  /** User who initiated the execution. */
  actorUserId: string
  /** User whose quota is charged; currently required to match actorUserId. */
  billableUserId: string
  /** Assistant version captured when the execution grant was issued. */
  assistantVersion: string
  /** Conversation to which this execution's usage is attributed. */
  conversationId: string
  /** Owning CLI session or managed invocation, distinct from an individual model call. */
  source: ModelExecutionSource
  /** Execution authorization ID; distinct from a model-access grant ID. */
  grantId: string
  /** Platform ID for the logical model call. */
  callId: string
  /** Upstream attempt ID, also used as the ledger requestId for idempotent delivery. */
  attemptId: string
  /** Optional upstream request reference for reconciliation; not the ledger idempotency key. */
  providerRequestId?: string
  /** Calling tool and version captured in the execution grant. */
  tool: { id: string; version: string }
}

/** Informational estimates only; never substitute for provider usage when settling execution charges. */
export interface ModelExecutionUsageEstimate {
  /** Estimated input count, validated as a non-negative integer. */
  inputTokens: number
  /** Estimated output count, validated as a non-negative integer. */
  outputTokens: number
  /** inputTokens + outputTokens; cache and reasoning counts must not be added again. */
  totalTokens: number
}

/** Filters for the current user's execution attempts in the selected organization. */
export interface ModelExecutionCallQuery {
  entry?: ModelExecutionEntry
  status?: import('./model-gateway.model').ModelGatewayCallStatusEnum
  assistantId?: string
  conversationId?: string
  /** CLI session ID or managed invocation ID, not a model call/attempt ID. */
  executionId?: string
  tool?: string
  model?: string
  environment?: ModelExecutionEnvironment['type']
  usageSource?: import('./model-gateway.model').ModelGatewayUsageSourceEnum
  /** pending means no authoritative pricing fact is available yet, not a zero charge. */
  pricingStatus?: 'priced' | 'free' | 'unpriced' | 'pending'
  /** Inclusive ISO 8601 timestamp bounds, including a timezone offset. */
  startedAfter?: string
  startedBefore?: string
}

/** Filter choices from the current user's executions in the selected organization. */
export interface ModelExecutionCallOptions {
  assistants: Array<{ id: string; name: string }>
  models: string[]
  tools: string[]
}

/** Personal attempt receipt. Raw token usage and provider prices remain in administrative ledgers. */
export interface ModelExecutionCallView {
  id: string
  callId: string
  attemptId: string
  context: ModelExecutionContext
  modelId: string
  model: string
  status: import('./model-gateway.model').ModelGatewayCallStatusEnum
  usageSource: import('./model-gateway.model').ModelGatewayUsageSourceEnum
  /** Model consumption points, independent of balance deductions; null means settlement or pricing is unresolved. */
  points: number | null
  pricingStatus: 'priced' | 'free' | 'unpriced' | 'pending'
  startedAt: string
  completedAt: string | null
  /** Actual usage was delivered to the ledger; zero-usage reviews create no usage entry. */
  delivered: boolean
}

/** Explicit model policy source in a Runtime binding; independent of the calling Agent identity. */
export const agentRuntimeModelSourceSchema = z
  .object({ type: z.literal('assistant'), xpertId: z.string().uuid() })
  .strict()
export type AgentRuntimeModelSource = z.output<typeof agentRuntimeModelSourceSchema>
