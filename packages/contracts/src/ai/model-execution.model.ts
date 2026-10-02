import type { AiModelTypeEnum } from '../agent'
import type { ModelFeature } from './ai-model.model'

/** Entry point and execution location are independent dimensions. */
export type ModelExecutionEntry = 'cli' | 'agent_runtime'
export type ModelExecutionProtocol =
  | 'openai_chat'
  | 'openai_responses'
  | 'anthropic_messages'
  | 'openai_responses_chat'
  | 'anthropic_messages_chat'
export type ModelExecutionEnvironment =
  | { type: 'computer' | 'sandbox'; environmentId: string; instanceId: string }
  | { type: 'remote'; bindingId: string; revision: string }
export type ModelExecutionSource =
  | { type: 'cli_session'; cliSessionId: string }
  | { type: 'agent_invocation'; invocationId: string; bindingId: string; bindingRevision: string }

export interface ModelExecutionModel {
  id: string
  copilotId: string
  providerScopeId: string
  providerOrganizationId: string | null
  provider: string
  model: string
  modelType: AiModelTypeEnum.LLM
  capabilities: ModelFeature[]
  protocols: ModelExecutionProtocol[]
}

export interface ModelExecutionContext {
  tenantId: string
  runtimeOrganizationId: string
  actorUserId: string
  billableUserId: string
  xpertId: string
  /** Display snapshot; historical grants may only have the immutable ID. */
  assistantName?: string
  assistantVersion: string
  conversationId: string
  threadId?: string
  source: ModelExecutionSource
  environment: ModelExecutionEnvironment
  tool: { id: string; version: string }
}

/** Money limits require proven provider-specific bounds; v1 admits token budgets only. */
export interface ModelExecutionLimits {
  tokenBudget: number
  userTokenBudget: number
  maxInputTokens: number
  maxOutputTokens: number
  maxConcurrentRequests: number
  requestsPerMinute: number
  leaseSeconds: number
  maxDurationSeconds: number
}

export type ModelExecutionPolicy =
  | { enabled: false }
  | {
      enabled: true
      gatewayBaseUrl: string
      /** Separately gated until each native protocol has passed real-model acceptance. */
      nativeProtocols?: Array<'openai_responses' | 'anthropic_messages'>
      /** Explicit, limited Chat Completions translations; never advertised as native support. */
      chatBridgeProtocols?: Array<'openai_responses' | 'anthropic_messages'>
      limits: ModelExecutionLimits
      tools: Array<{ id: 'aider' | 'opencode' | 'codex' | 'claude'; version: string; executable: string }>
    }

export type CliSessionStatus = 'starting' | 'running' | 'stopping' | 'exited' | 'unknown'

/** Guest executable/version probe result; unknown means the installation could not be confirmed. */
export type ComputerCliInstallation = 'installed' | 'missing' | 'version_mismatch' | 'unknown'

export const MODEL_EXECUTION_POLICY_SETTING = 'modelExecutionPolicy'

/** Authorized Computer tool inventory; installation, model support and managed execution are independent. */
export interface ComputerCliToolsView {
  /** A conversation is required to resolve the Assistant's available models. */
  state: 'ready' | 'disabled' | 'conversation_required'
  tools: Array<{
    /** Policy-approved executable identifier and pinned version. */
    id: string
    version: string
    /** Installed at the required version and compatible with the selected model. */
    available: boolean
    /** Probe of the current container; unknown must not be treated as installed. */
    installation: ComputerCliInstallation
    /** The Assistant's selected model supports this tool's approved protocol. */
    modelCompatible: boolean
    /** A registered background runtime supports this tool, version and Computer environment. */
    managed: boolean
  }>
  /** Current launch defaults; existing sessions retain their own issuance snapshot. */
  launch?: {
    assistant: string
    model: string
    /** Server-resolved path inside the mounted Computer workspace. */
    workingDirectory: string
    /** Maximum token budget for a newly issued session. */
    tokenBudget: number
  }
}

/** Owned interactive CLI session summary; excludes execution credentials and Docker connection details. */
export interface CliSessionView {
  /** Session identity, distinct from a model call or desktop control ticket. */
  id: string
  /** Immutable conversation and Assistant bindings. */
  conversationId: string
  xpertId: string
  /** Policy-approved tool/version recorded at creation. */
  tool: { id: string; version: string }
  /** Host-observed lifecycle; unknown never implies completion or permission to relaunch. */
  status: CliSessionStatus
  /** Platform model identifier captured at issuance; empty if no grant was issued. */
  defaultModelId: string
  /** Original Assistant display snapshot; historical records may fall back to its ID. */
  assistantName: string
  /** Original default model name; empty if no grant was issued. */
  model: string
  /** Server-resolved session workspace path inside Computer. */
  workingDirectory: string
  /** Issued session budget; zero if the session did not obtain a grant. */
  tokenBudget: number
  /** Recorded actual tokens across this grant's attempts, excluding estimates. */
  usedTokens: number
  /** Tokens still reserved for attempts whose usage is not confirmed. */
  reservedTokens: number
  /** ISO absolute execution deadline, not the renewable lease expiry; creation time without a grant. */
  expiresAt: string
  /** Supervisor exit code when observed; null or absent if not known. */
  exitCode?: number | null
}

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

/** Read-only attempt receipt. No request bodies, model credentials or provider secrets. */
export interface ModelExecutionCallView {
  id: string
  callId: string
  attemptId: string
  context: ModelExecutionContext
  modelId: string
  model: string
  status: import('./model-gateway.model').ModelGatewayCallStatusEnum
  usageSource: import('./model-gateway.model').ModelGatewayUsageSourceEnum
  inputTokens: number
  outputTokens: number
  totalTokens: number
  /** Budget still held for an attempt whose actual usage is not yet confirmed. */
  reservedTokens: number
  /** Diagnostic estimate only; excluded from actual token totals and charges. */
  estimatedUsage: ModelExecutionUsageEstimate | null
  priceAmount: number | null
  priceCurrency: string | null
  pricingStatus: 'priced' | 'free' | 'unpriced' | 'pending'
  startedAt: string
  completedAt: string | null
  /** Actual usage was delivered to the ledger; zero-usage reviews create no usage entry. */
  delivered: boolean
}
