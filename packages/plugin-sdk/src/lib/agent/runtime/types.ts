import type { AgentInvocationStatus, AgentRuntimeProgress, ModelExecutionEnvironment } from '@xpert-ai/contracts'
export type { AgentInvocationStatus, AgentRuntimeProgress } from '@xpert-ai/contracts'
import type { AgentInvocationDispatchContext } from './dispatch'
import type { AgentRunnerReceipt } from './execution-runner'
import type { AgentOutputDelivery, AgentOutputExport, AgentResultArtifact, AgentResultItem } from './results'

/** Serializable invocation data. Use finite numbers and plain objects; exclude credentials. */
export type AgentJson = null | boolean | number | string | AgentJson[] | { [key: string]: AgentJson }

/** Host-authorized ownership and execution scope; never accept identities from model input. */
export interface AgentInvocationScope {
  tenantId: string
  organizationId: string
  userId: string
  workspaceId?: string
  projectId?: string
  /** Platform conversation ID, distinct from a provider session ID. */
  conversationId?: string
  /** Opaque parent execution identity; host Task adapters may use logical IDs. */
  parentExecutionId: string
  /** Calling Agent key or host-assigned background-task entry. */
  callerAgentKey: string
  /** Omitted preserves existing Assistant callers. Project general agents have no fabricated Assistant ID. */
  callerType?: 'xpert' | 'project_agent'
  callerXpertId?: string
}

/** Authorized, version-pinned target. Pass the resolved snapshot unchanged. */
export interface AgentTarget {
  /** Opaque host binding ID; do not assume UUID format or derive the provider from it. */
  bindingId: string
  /** Registered AgentRuntimeStrategy key. */
  provider: string
  /** Opaque configuration version, distinct from the invocation revision. */
  revision: string
  /** Provider-specific target/profile reference. */
  reference: string
  /** Validated configuration; use managed secret references instead of credentials. */
  configuration: { [key: string]: AgentJson }
}

/** Provider support flags; they do not grant caller permissions. */
export interface AgentRuntimeCapabilities {
  /** Explicit adapter compatibility; does not install tools or grant model/environment access. */
  executionTools?: Array<{ id: string; versions: string[]; environments: ModelExecutionEnvironment['type'][] }>

  /**
   * Recovery by host checkpoint, existing provider session, or none.
   * Session recovery does not guarantee survival of a worker crash.
   */
  recovery: 'checkpoint' | 'session' | 'none'
  interactions: boolean
  /** Supports cancel requests; termination still requires provider confirmation. */
  cancellation: boolean
  /** Work can continue after start() returns. */
  background: boolean
  /** Omitted means unsupported. This declaration alone does not enable a host message API. */
  runningMessages?: boolean
  /** A new invocation may reuse a prior session only through an explicitly supported adapter path. */
  sessionContinuation?: boolean
}

/** Provider-neutral task payload; supported structured fields depend on the adapter. */
export interface AgentInvocationInput {
  prompt: string
  /** No export by default; files/archive require an explicit delivery request. */
  delivery?: AgentOutputDelivery
  parameters?: { [key: string]: AgentJson }
  context?: { [key: string]: AgentJson }
  /** Host-managed file references, authorized and materialized by the adapter. */
  files?: Array<{
    id: string
    name?: string
  }>
}

/** Output or in-progress receipt. Check invocation status before treating it as final. */
export interface AgentInvocationResult {
  text: string
  /** Explicit adapter-normalized findings; display kind is never inferred from prose or titles. */
  items?: AgentResultItem[]
  /** Separate delivery outcome; task success does not imply that files were exported. */
  export?: AgentOutputExport
  /** Adapter-defined structured output. */
  data?: AgentJson
  /** Host-managed output references; normal artifact authorization applies. */
  artifacts?: AgentResultArtifact[]
}

/** Persisted provider receipt. Session/run IDs are distinct from the host invocation ID. */
export interface AgentRuntimeHandle {
  /** Optional host-managed process receipt; direct remote runtimes need only their session/run IDs. */
  runner?: AgentRunnerReceipt
  sessionId: string
  runId: string
  metadata?: { [key: string]: AgentJson }
}

/** Pending question or approval. Respond using its exact ID and provider-defined data schema. */
export interface AgentInteraction {
  id: string
  kind: 'approval' | 'input'
  prompt: string
  data?: AgentJson
}

/**
 * Partial provider observation; omitted fields may retain previously stored values.
 * The host manages identity, revisions and persistence.
 */
export interface AgentRuntimeObservation {
  /** succeeded requires a result, even for structured-only output. */
  status: AgentInvocationStatus
  handle?: AgentRuntimeHandle
  result?: AgentInvocationResult
  interaction?: AgentInteraction
  /** Reported work/activity only; it never confirms business acceptance. */
  progress?: AgentRuntimeProgress
  /** Safe diagnostic message without credentials or raw provider payloads. */
  error?: string
}

/** Request pinned by the host before dispatch. */
export interface AgentInvocationRequest {
  target: AgentTarget
  /**
   * Idempotency key within the captured scope (max 1024 characters).
   * Reuse for the same request; changed input or target is a conflict.
   */
  callId: string
  input: AgentInvocationInput
  /** Optional host-owned asynchronous reply and project association; not supplied by the execution Agent. */
  dispatch?: AgentInvocationDispatchContext
}

/** Host-owned invocation snapshot; not an update DTO. */
export interface AgentInvocation extends AgentRuntimeObservation {
  /** Host invocation ID used by inspect, cancel and respond. */
  id: string
  /** Host-managed concurrency revision, distinct from the target version. */
  revision: number
  scope: AgentInvocationScope
  request: AgentInvocationRequest
  /** Host timestamps in ISO 8601 format. */
  createdAt: string
  updatedAt: string
}

/** Checks confirmed completion; unknown remains non-terminal. */
export function isAgentInvocationTerminal(status: AgentInvocationStatus): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'cancelled'
}
