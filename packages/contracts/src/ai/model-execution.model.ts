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

export const MODEL_EXECUTION_POLICY_SETTING = 'modelExecutionPolicy'
