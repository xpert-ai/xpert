import type { HandoffMessage, ProcessResult } from '../../agent/handoff/types'

export type HandoffPermissionOperation = 'enqueue' | 'wait'

/**
 * Handoff Queue Permission
 * Example: { type: 'handoff', operations: ['enqueue', 'wait'] }
 */
export interface HandoffPermission {
  type: 'handoff'
  operations?: HandoffPermissionOperation[]
  scope?: string[]
  description?: string
}

/**
 * System token for resolving handoff queue service from plugin context.
 */
export const HANDOFF_PERMISSION_SERVICE_TOKEN = 'XPERT_PLUGIN_HANDOFF_PERMISSION_SERVICE'

/**
 * Internal system token used by core to expose the handoff queue bridge.
 */
export const HANDOFF_QUEUE_SERVICE_TOKEN = 'XPERT_HANDOFF_QUEUE_SERVICE'

export interface HandoffEnqueueOptions {
  delayMs?: number
}

export interface HandoffEnqueueAndWaitOptions extends HandoffEnqueueOptions {
  timeoutMs?: number
  onEvent?: (event: unknown) => void
}

/**
 * Handoff queue service exposed to plugins under permission control.
 */
export interface HandoffPermissionService {
  enqueue(message: HandoffMessage, options?: HandoffEnqueueOptions): Promise<{ id: string }>
  enqueueAndWait(message: HandoffMessage, options?: HandoffEnqueueAndWaitOptions): Promise<ProcessResult>
}
