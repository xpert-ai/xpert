import type { WorkbenchExtensionViewOpenRequest, XpertViewScalar } from './model'

/** Live-only UI request. Project scope is mandatory; history playback must not reopen Views. */
export const WORKBENCH_VIEW_OPEN_EVENT = 'workbench.view.open'
export interface WorkbenchViewOpenEvent extends WorkbenchExtensionViewOpenRequest {
  type: typeof WORKBENCH_VIEW_OPEN_EVENT
  projectId: string
  conversationId?: string
}

/** Parse the public lg.chat.event boundary, keeping arbitrary logs out of navigation. */
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
