import type { JSONValue } from '@xpert-ai/contracts'

export interface McpTaskExecutionPolicy {
  mode: 'optional' | 'required'
  maxLifetimeMs?: number
}

export interface ToolTaskCreateRequest {
  capabilityKey: string
  requestId: string
  idempotencyKey: string
  input?: JSONValue
  expiresAt?: Date | string
}

export interface ToolTaskHandle {
  taskId: string
  status: 'working' | 'input_required' | 'completed' | 'failed' | 'cancelled'
}

export interface ToolTasksApi {
  create(request: ToolTaskCreateRequest): Promise<ToolTaskHandle>
  update(taskId: string, patch: { progress?: number; status?: ToolTaskHandle['status'] }): Promise<ToolTaskHandle>
  cancel(taskId: string): Promise<ToolTaskHandle>
}
