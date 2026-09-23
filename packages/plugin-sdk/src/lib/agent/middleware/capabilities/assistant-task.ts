import type { JSONValue, TAvatar } from '@xpert-ai/contracts'
import { createRuntimeCapability } from '../../../core/runtime-capability'

/** Task lifecycle snapshot. interrupted means paused; unknown does not confirm failure. */
export type AgentMiddlewareAssistantTaskStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'interrupted'
  | 'unknown'

/** Existing platform file reference; access remains subject to host authorization. */
export type AgentMiddlewareAssistantTaskFile = {
  id?: string
  fileId?: string
  fileAssetId?: string
  storageFileId?: string
  originalName?: string
  name?: string
  mimeType?: string
  mimetype?: string
  size?: number
  role?: string
}

/**
 * Portable plugin skill identity, resolved through the target Agent's connected Skills Middleware.
 * Do not persist workspace-local SkillPackage UUIDs in plugin configuration.
 */
export type AgentMiddlewareAssistantTaskSkillRef = {
  pluginName: string
  componentKey: string
}

/** Portable plugin/template/Agent identity used to resolve a deployed Assistant. */
export type AgentMiddlewareExternalAssistantExpectation = {
  pluginName: string
  templateKey: string
  agentKey: string
}

/** Resolve the executor from the requester's required, direct published external-Assistant connections. */
export type AgentMiddlewareAssistantTaskTarget = {
  kind: 'external_assistant'
  requesterXpertId: string
  requesterAgentKey: string
  expectation: AgentMiddlewareExternalAssistantExpectation
}

/** Plugin-owned operation identity for reconciling executions with a domain subject. */
export type AgentMiddlewareExecutionCorrelation = {
  namespace: string
  operationId: string
  subjectId: string
  attributes?: Record<string, JSONValue>
}

/** Availability of a resolved external Assistant binding. */
export type AgentMiddlewareExternalAssistantBindingStatus =
  | 'available'
  | 'incompatible'
  | 'unpublished'
  | 'cross_organization'

/** Binding display metadata; intentionally omits the deployed Assistant instance ID. */
export type AgentMiddlewareExternalAssistantBinding = {
  title: string
  name: string
  avatar?: TAvatar
  templateSource: {
    templateId: string
    templateKey: string
    pluginName?: string
    source?: string
  } | null
  primaryAgentKey?: string
  publishedVersion?: string
  status: AgentMiddlewareExternalAssistantBindingStatus
}

/** Requester whose required direct external-Assistant bindings should be listed. */
export type AgentMiddlewareListExternalAssistantBindingsInput = {
  requesterXpertId: string
  requesterAgentKey: string
}

/** Requester-scoped execution lookup for a plugin namespace and domain subject. */
export type AgentMiddlewareListCorrelatedExecutionsInput = {
  requesterXpertId: string
  requesterAgentKey: string
  namespace: string
  subjectId: string
  limit?: number
}

/** Execution receipt for domain reconciliation; executor fields identify the resolved published Assistant. */
export type AgentMiddlewareCorrelatedExecution = {
  operationId: string
  subjectId: string
  attributes?: Record<string, JSONValue>
  status: AgentMiddlewareAssistantTaskStatus
  executionId: string
  parentExecutionId?: string
  threadId?: string
  executorXpertId: string
  executorAgentKey?: string
  executorAssistantTemplateKey?: string
  executorAssistantTitle?: string
  executorPublishedVersion?: string
  startedAt?: string
  updatedAt?: string
}

/** Start an asynchronous task on the current Assistant or a resolved external Assistant. */
export type AgentMiddlewareAssistantTaskInput = {
  /** Current/requesting Assistant ID; must match target.requesterXpertId when target is supplied. */
  xpertId: string
  /** Selects the base/Primary model; child Agents retain authored models. */
  modelId?: string
  /** Entry Agent for the current Assistant; external targets use their resolved primary Agent. */
  agentKey?: string
  /** Optional external executor resolved from the requester's published graph. */
  target?: AgentMiddlewareAssistantTaskTarget
  conversationId?: string | null
  executionId?: string | null
  projectId?: string | null
  taskId?: string
  /** Per-run idempotency key. Otherwise correlation.operationId or executionId is used; taskId alone is insufficient. */
  clientMessageId?: string
  prompt: string
  files?: AgentMiddlewareAssistantTaskFile[]
  /** Skills expected to load through the target Agent's connected Skills Middleware. */
  selectedSkillRefs?: AgentMiddlewareAssistantTaskSkillRef[]
  /** Additional bounded runtime input; does not override the task prompt or files. */
  humanInput?: Record<string, JSONValue>
  context?: Record<string, unknown>
  correlation?: AgentMiddlewareExecutionCorrelation
}

/** Task receipt, not necessarily a completed result. Use status and execution identifiers to follow progress. */
export type AgentMiddlewareAssistantTaskResult = {
  status: AgentMiddlewareAssistantTaskStatus
  taskId?: string
  executionId?: string
  conversationId?: string
  threadId?: string
  errorMessage?: string
  executorXpertId?: string
  executorAgentKey?: string
  executorAssistantTemplateKey?: string
  executorAssistantTitle?: string
  executorPublishedVersion?: string
}

/** Host task/execution identifiers for lookup. Cancellation requires an execution, conversation or thread ID. */
export type AgentMiddlewareAssistantTaskStatusInput = {
  taskId?: string
  executionId?: string
  conversationId?: string
  threadId?: string
  clientMessageId?: string
  xpertId?: string
}

/** Platform executions affected by the cancellation request. */
export type AgentMiddlewareAssistantTaskCancelResult = {
  canceledExecutionIds: string[]
}

/** Host Assistant Task API. Feature-detect optional methods before calling them. */
export interface AgentMiddlewareAssistantTaskApi {
  getModels?(xpertId: string): Promise<import('@xpert-ai/contracts').TAssistantModelsResponse>
  /** Submit once and retain the receipt; use getTaskStatus to follow asynchronous progress. */
  startTask(input: AgentMiddlewareAssistantTaskInput): Promise<AgentMiddlewareAssistantTaskResult>
  /** List safe binding descriptors without deployed Assistant instance IDs. */
  listExternalAssistantBindings?(
    input: AgentMiddlewareListExternalAssistantBindingsInput
  ): Promise<AgentMiddlewareExternalAssistantBinding[]>
  /** Read executions owned by the requester and its currently bound external Assistants. */
  listCorrelatedExecutions?(
    input: AgentMiddlewareListCorrelatedExecutionsInput
  ): Promise<AgentMiddlewareCorrelatedExecution[]>
  /** Return the current receipt, or null if no matching task is found. */
  getTaskStatus?(input: AgentMiddlewareAssistantTaskStatusInput): Promise<AgentMiddlewareAssistantTaskResult | null>
  cancelTask?(input: AgentMiddlewareAssistantTaskStatusInput): Promise<AgentMiddlewareAssistantTaskCancelResult>
}

/** Scoped runtime capability for platform Assistant tasks. */
export const AssistantTaskRuntimeCapability = createRuntimeCapability<AgentMiddlewareAssistantTaskApi>(
  'platform.assistant_task',
  {
    description: 'Start asynchronous tasks on the current platform assistant.'
  }
)
