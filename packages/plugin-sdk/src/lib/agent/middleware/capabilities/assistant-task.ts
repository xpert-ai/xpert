import type { JSONValue, TAvatar } from '@xpert-ai/contracts'
import { createRuntimeCapability } from '../../../core/runtime-capability'

export type AgentMiddlewareAssistantTaskStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'interrupted'
  | 'unknown'

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
 * Stable plugin skill reference used by Assistant Tasks.
 *
 * Plugin-owned callers must not persist workspace-local SkillPackage UUIDs.
 * The host resolves this portable identity to the installed package and verifies
 * that the target Agent is directly connected to the owning Skills Middleware.
 */
export type AgentMiddlewareAssistantTaskSkillRef = {
  pluginName: string
  componentKey: string
}

/**
 * Portable role identity used to resolve an organization-owned Assistant.
 * Instance UUIDs stay out of plugin contracts so the same workflow is deployable across organizations.
 */
export type AgentMiddlewareExternalAssistantExpectation = {
  pluginName: string
  templateKey: string
  agentKey: string
}

/** Resolve the executor from the requester's required, direct external-Xpert connections. */
export type AgentMiddlewareAssistantTaskTarget = {
  kind: 'external_assistant'
  requesterXpertId: string
  requesterAgentKey: string
  expectation: AgentMiddlewareExternalAssistantExpectation
}

/** Stable plugin-owned identity for reconciling platform executions with a domain operation. */
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

/** Safe external Assistant metadata that may cross plugin and View Host boundaries. */
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

/** Identifies the requester whose required direct bindings should be listed. */
export type AgentMiddlewareListExternalAssistantBindingsInput = {
  requesterXpertId: string
  requesterAgentKey: string
}

/** Selects correlated executions for one requester-owned domain subject. */
export type AgentMiddlewareListCorrelatedExecutionsInput = {
  requesterXpertId: string
  requesterAgentKey: string
  namespace: string
  subjectId: string
  limit?: number
}

/** Safe execution summary returned to a plugin for domain reconciliation. */
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

export type AgentMiddlewareAssistantTaskInput = {
  xpertId: string
  agentKey?: string
  /** Resolve an organization-owned external Assistant from the requester's published graph. */
  target?: AgentMiddlewareAssistantTaskTarget
  conversationId?: string | null
  executionId?: string | null
  projectId?: string | null
  taskId?: string
  clientMessageId?: string
  prompt: string
  files?: AgentMiddlewareAssistantTaskFile[]
  /** Skills that this task is expected to load through its target Agent's Skills Middleware. */
  selectedSkillRefs?: AgentMiddlewareAssistantTaskSkillRef[]
  /** Additional bounded human-input fields exposed to runtime-state fixed filters. */
  humanInput?: Record<string, JSONValue>
  context?: Record<string, unknown>
  correlation?: AgentMiddlewareExecutionCorrelation
}

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

export type AgentMiddlewareAssistantTaskStatusInput = {
  taskId?: string
  executionId?: string
  conversationId?: string
  threadId?: string
  clientMessageId?: string
  xpertId?: string
}

export type AgentMiddlewareAssistantTaskCancelResult = {
  canceledExecutionIds: string[]
}

export interface AgentMiddlewareAssistantTaskApi {
  startTask(input: AgentMiddlewareAssistantTaskInput): Promise<AgentMiddlewareAssistantTaskResult>
  /** Return only safe binding descriptors; internal Assistant instance IDs are intentionally omitted. */
  listExternalAssistantBindings?(
    input: AgentMiddlewareListExternalAssistantBindingsInput
  ): Promise<AgentMiddlewareExternalAssistantBinding[]>
  /** Read executions owned by the requester and its currently bound external Assistants. */
  listCorrelatedExecutions?(
    input: AgentMiddlewareListCorrelatedExecutionsInput
  ): Promise<AgentMiddlewareCorrelatedExecution[]>
  getTaskStatus?(input: AgentMiddlewareAssistantTaskStatusInput): Promise<AgentMiddlewareAssistantTaskResult | null>
  cancelTask?(input: AgentMiddlewareAssistantTaskStatusInput): Promise<AgentMiddlewareAssistantTaskCancelResult>
}

export const AssistantTaskRuntimeCapability = createRuntimeCapability<AgentMiddlewareAssistantTaskApi>(
  'platform.assistant_task',
  {
    description: 'Start asynchronous tasks on the current platform assistant.'
  }
)
