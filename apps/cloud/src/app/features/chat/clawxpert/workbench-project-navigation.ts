// Project Views retain their own authorized scope. Opening one must never
// change the chat's Project, thread, composer, or ChatKit session binding.
import { effect, untracked, type WritableSignal } from '@angular/core'
import { AGENT_WORKBENCH_SLOT, type WorkbenchAssistantProjectOpenRequest } from '@xpert-ai/contracts'
import { firstValueFrom } from 'rxjs'
import type { ViewExtensionApiService } from '../../../@core/services/view-extension-api.service'
import type { ClawXpertFixedViewTab } from './clawxpert-fixed-view-stack.component'
import type { ClawXpertWorkbenchViewUrlState } from './clawxpert-workbench-view-url-state.service'
import type { ClawXpertWorkspaceTab } from './conversation-detail/workspace/tabs'
import { equalViewQuery, findResolvedViewByKey, resolveI18nText } from './conversation-detail/workspace/fixed-views'

type ProjectViewOptions = {
  hostId: () => string | null
  routeKey: () => string
  language: () => string
  views: Pick<ViewExtensionApiService, 'getSlotViews'>
  tabs: WritableSignal<ClawXpertWorkspaceTab[]>
  activate: (id: string, mode: 'push' | 'none') => void
  selectProject: (projectId: string) => Promise<boolean> | void
  url: Pick<ClawXpertWorkbenchViewUrlState, 'viewKey' | 'viewQuery' | 'projectId'>
  onError: (error: unknown) => void
}

export function createWorkbenchProjectNavigation(options: ProjectViewOptions) {
  let revision = 0
  const open = async (request: WorkbenchAssistantProjectOpenRequest, restore = false, cancelled = () => false) => {
    // Legacy commands without a View explicitly select a new chat workspace.
    if (!request.view) return options.selectProject(request.projectId)
    const hostId = options.hostId()
    if (!hostId) throw new Error('The Workbench Assistant is not available.')
    const routeKey = options.routeKey()
    const current = ++revision
    const view = request.view
    const query = {
      ...(view.selectionId ? { selectionId: view.selectionId } : {}),
      ...(view.parameters ? { parameters: view.parameters } : {})
    }
    const existing = options
      .tabs()
      .find(
        (tab): tab is ClawXpertFixedViewTab =>
          tab.kind === 'fixed-view' && tab.projectScope?.projectId === request.projectId && tab.viewKey === view.viewKey
      )
    if (restore && existing && equalViewQuery(existing.query, query)) {
      options.activate(existing.id, 'none')
      return true
    }
    const manifests = await firstValueFrom(
      options.views.getSlotViews('agent', hostId, AGENT_WORKBENCH_SLOT, {
        runtimeScope: { projectId: request.projectId }
      })
    )
    if (cancelled() || current !== revision || hostId !== options.hostId() || routeKey !== options.routeKey())
      return false
    const available = manifests
      .filter((manifest) => manifest.visible !== false)
      .map((manifest) => ({
        ...manifest,
        viewKey: manifest.key
      }))
    const manifest = findResolvedViewByKey(available, view.viewKey)
    if (!manifest) throw new Error(`Workbench view '${view.viewKey}' is not available.`)
    const tab: ClawXpertFixedViewTab = {
      id: `project-view:${JSON.stringify([hostId, request.projectId, manifest.key])}`,
      kind: 'fixed-view',
      viewKey: manifest.key,
      title: resolveI18nText(manifest.title, manifest.key, options.language()),
      icon: manifest.icon ?? null,
      query,
      projectScope: { projectId: request.projectId }
    }
    options.tabs.update((tabs) =>
      tabs.some((item) => item.id === tab.id) ? tabs.map((item) => (item.id === tab.id ? tab : item)) : [...tabs, tab]
    )
    options.activate(tab.id, restore ? 'none' : 'push')
    return true
  }

  effect((onCleanup) => {
    const hostId = options.hostId()
    const projectId = options.url.projectId()
    const viewKey = options.url.viewKey()
    const query = options.url.viewQuery()
    options.routeKey()
    if (!hostId || !projectId || !viewKey) return
    let cancelled = false
    untracked(
      () =>
        void open({ projectId, view: { viewKey, ...query } }, true, () => cancelled).catch((error: unknown) => {
          if (!cancelled) options.onError(error)
        })
    )
    onCleanup(() => {
      cancelled = true
    })
  })
  return { open }
}
