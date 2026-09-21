import type { WorkbenchAssistantProjectOpenRequest } from '@xpert-ai/contracts'
import type { WorkbenchChatFacade } from '../workbench-chat/workbench-chat.facade'

/** Resolve the manifest alias before one route transition; never hard-code plugin routes. */
export function openWorkbenchProject(
  request: WorkbenchAssistantProjectOpenRequest,
  views: ReadonlyArray<{ viewKey: string }>,
  facade: Pick<WorkbenchChatFacade, 'onChatProjectChange'>
) {
  if (!facade.onChatProjectChange) throw new Error('Project navigation is unavailable in this host.')
  const view = request.view
  if (!view) return facade.onChatProjectChange(request.projectId)
  const exact = views.find((item) => item.viewKey === view.viewKey)
  const aliases = views.filter((item) => item.viewKey.endsWith(`__${view.viewKey}`))
  const resolved = exact ?? (aliases.length === 1 ? aliases[0] : undefined)
  if (!resolved) throw new Error(`Workbench view '${view.viewKey}' is not available.`)
  return facade.onChatProjectChange(request.projectId, { ...view, viewKey: resolved.viewKey })
}
