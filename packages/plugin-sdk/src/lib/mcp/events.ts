export const MCP_CAPABILITY_CHANGE_EVENT_TYPES = [
  'tools.changed',
  'resources.changed',
  'resource.updated',
  'prompts.changed',
  'task.updated'
] as const

export type CapabilityChangeEventType = (typeof MCP_CAPABILITY_CHANGE_EVENT_TYPES)[number]

export interface CapabilityChangeEvent {
  type: CapabilityChangeEventType
  key?: string
  taskId?: string
}

export interface ToolEventsApi {
  emit(event: CapabilityChangeEvent): Promise<void> | void
}
