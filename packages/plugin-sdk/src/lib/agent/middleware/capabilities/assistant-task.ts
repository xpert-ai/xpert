import type { JSONValue } from '@xpert-ai/contracts'
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

export type AgentMiddlewareAssistantTaskInput = {
  xpertId: string
  agentKey?: string
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
}

export type AgentMiddlewareAssistantTaskResult = {
  status: AgentMiddlewareAssistantTaskStatus
  taskId?: string
  executionId?: string
  conversationId?: string
  threadId?: string
  errorMessage?: string
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
  getTaskStatus?(input: AgentMiddlewareAssistantTaskStatusInput): Promise<AgentMiddlewareAssistantTaskResult | null>
  cancelTask?(input: AgentMiddlewareAssistantTaskStatusInput): Promise<AgentMiddlewareAssistantTaskCancelResult>
}

export const AssistantTaskRuntimeCapability = createRuntimeCapability<AgentMiddlewareAssistantTaskApi>(
  'platform.assistant_task',
  {
    description: 'Start asynchronous tasks on the current platform assistant.'
  }
)
