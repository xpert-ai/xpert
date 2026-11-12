import type { WorkbenchExtensionViewOpenRequest } from './client-commands'
import type { XpertViewScalar } from './model'

/** Live-only UI request. Project scope is mandatory; history playback must not reopen Views. */
export const WORKBENCH_VIEW_OPEN_EVENT = 'workbench.view.open'
/**
 * Server-emitted instruction to open a declared View in the current Workbench context.
 * Consumers verify Project/conversation scope and suppress stale or duplicate requests; the event grants no resource access.
 * requestId and issuedAt are optional as a pair for legacy emitters; new navigation emitters should provide both.
 */
export interface WorkbenchViewOpenEvent extends WorkbenchExtensionViewOpenRequest {
  /** Stable event discriminator; arbitrary logs and similarly shaped objects are not navigation requests. */
  type: typeof WORKBENCH_VIEW_OPEN_EVENT
  /** Project that owns the navigation context; must match the active authorized Workbench scope. */
  projectId: string
  /** Unique event deduplication ID, separate from the View's selectionId; supply together with issuedAt. */
  requestId?: string
  /** Positive Unix epoch milliseconds used for freshness checks; supply together with requestId. */
  issuedAt?: number
  /** Conversation restriction when present; consumers must not apply it to another conversation. */
  conversationId?: string
}

/**
 * Parse the public lg.chat.event shape and paired replay metadata, keeping arbitrary logs out of navigation.
 * Returns null for invalid payloads. Shape validation does not perform access, active-scope or freshness checks.
 */
export function parseWorkbenchViewOpenEvent(value: unknown): WorkbenchViewOpenEvent | null {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !('type' in value) ||
    value.type !== WORKBENCH_VIEW_OPEN_EVENT ||
    !('viewKey' in value) ||
    typeof value.viewKey !== 'string' ||
    !value.viewKey.trim() ||
    !('projectId' in value) ||
    typeof value.projectId !== 'string' ||
    !value.projectId.trim()
  )
    return null
  if ('requestId' in value && (typeof value.requestId !== 'string' || !value.requestId.trim())) return null
  if (
    'issuedAt' in value &&
    (typeof value.issuedAt !== 'number' || !Number.isSafeInteger(value.issuedAt) || value.issuedAt <= 0)
  )
    return null
  if ('requestId' in value !== 'issuedAt' in value) return null
  if ('conversationId' in value && typeof value.conversationId !== 'string') return null
  if ('selectionId' in value && typeof value.selectionId !== 'string') return null
  const parameters: NonNullable<WorkbenchExtensionViewOpenRequest['parameters']> = {}
  if ('parameters' in value) {
    if (!value.parameters || typeof value.parameters !== 'object' || Array.isArray(value.parameters)) return null
    for (const [key, item] of Object.entries(value.parameters)) {
      if (isViewScalar(item)) parameters[key] = item
      else if (Array.isArray(item) && item.every(isViewScalar)) parameters[key] = item
      else return null
    }
  }
  return {
    type: WORKBENCH_VIEW_OPEN_EVENT,
    viewKey: value.viewKey,
    projectId: value.projectId,
    ...('requestId' in value && 'issuedAt' in value
      ? { requestId: value.requestId as string, issuedAt: value.issuedAt as number }
      : {}),
    ...('conversationId' in value ? { conversationId: value.conversationId as string } : {}),
    ...('selectionId' in value ? { selectionId: value.selectionId as string } : {}),
    ...('parameters' in value ? { parameters } : {})
  }
}
function isViewScalar(value: unknown): value is XpertViewScalar {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  )
}
