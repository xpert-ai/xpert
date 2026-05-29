import { createRuntimeCapability } from '../runtime-capability'

export type AgentMiddlewareAssistantTaskStatus = 'queued' | 'running'

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
}

export interface AgentMiddlewareAssistantTaskApi {
  startTask(input: AgentMiddlewareAssistantTaskInput): Promise<AgentMiddlewareAssistantTaskResult>
}

export const AssistantTaskRuntimeCapability = createRuntimeCapability<AgentMiddlewareAssistantTaskApi>(
  'platform.assistant_task',
  {
    description: 'Start asynchronous tasks on the current platform assistant.'
  }
)
