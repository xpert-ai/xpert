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
