import { computed } from '@angular/core'
import type { ChatKitWorkbenchNavigation } from '@xpert-ai/chatkit-types'
import {
  AGENT_WORKBENCH_SLOT,
  type WorkbenchAssistantProjectOpenRequest,
  type WorkbenchExtensionViewOpenRequest
} from '@xpert-ai/contracts'
import { firstValueFrom } from 'rxjs'
import type { ViewExtensionApiService } from '../../../@core/services/view-extension-api.service'
import { canRenderViewInChatkit, findResolvedViewByKey } from './conversation-detail/workspace/fixed-views'
import type { ClawXpertWorkbenchViewUrlState } from './clawxpert-workbench-view-url-state.service'

/** ChatKit owns rendering; the host authorizes and persists View navigation. */
export function createChatkitWorkbenchNavigation(options: {
  assistantId: () => string | null
  projectId: () => string | null
  routeKey: () => string
  defaultViewKey: () => string | null
  isChatkitView: (key: string | null) => boolean
  views: Pick<ViewExtensionApiService, 'getSlotViews'>
  url: Pick<
    ClawXpertWorkbenchViewUrlState,
    'viewKey' | 'viewQuery' | 'viewLayout' | 'projectId' | 'viewClosed' | 'setViewState'
  >
  selectProject: (projectId: string, view?: WorkbenchExtensionViewOpenRequest) => Promise<boolean> | void
}) {
  let revision = 0
  const state = computed<ChatKitWorkbenchNavigation>(() => {
    const viewKey = options.url.viewKey() ?? (options.url.viewClosed() ? null : options.defaultViewKey())
    return {
      // Legacy deep links carry a separately scoped Project; never apply that
      // query to the current session before its destination has been authorized.
      projectId: options.url.projectId() ?? options.projectId(),
      view:
        viewKey && options.isChatkitView(viewKey)
          ? {
              viewKey,
              ...options.url.viewQuery(),
              ...(options.url.viewLayout() ? { layout: options.url.viewLayout()! } : {})
            }
          : null
    }
  })

  const openProject = async (request: WorkbenchAssistantProjectOpenRequest, cancelled = () => false) => {
    const assistantId = options.assistantId()
    if (!assistantId) return false
    const routeKey = options.routeKey()
    const version = ++revision
    let view = request.view
    if (view) {
      const manifests = await firstValueFrom(
        options.views.getSlotViews('agent', assistantId, AGENT_WORKBENCH_SLOT, {
          runtimeScope: { projectId: request.projectId }
        })
      )
      if (
        cancelled() ||
        version !== revision ||
        assistantId !== options.assistantId() ||
        routeKey !== options.routeKey()
      )
        return false
      const manifest = findResolvedViewByKey(
        manifests.filter((item) => item.visible !== false).map((item) => ({ ...item, viewKey: item.key })),
        view.viewKey
      )
      if (!manifest || !canRenderViewInChatkit(manifest.view))
        throw new Error(`ChatKit view '${view.viewKey}' is not available.`)
      view = { ...view, viewKey: manifest.key }
    }
    if (request.projectId === options.projectId()) {
      return view ? options.url.setViewState(view.viewKey, viewQuery(view)) : true
    }
    return options.selectProject(request.projectId, view)
  }

  const openView = async (view: WorkbenchExtensionViewOpenRequest) => {
    const version = ++revision
    const assistantId = options.assistantId()
    if (!assistantId) return false
    const routeKey = options.routeKey()
    const manifests = await firstValueFrom(
      options.views.getSlotViews('agent', assistantId, AGENT_WORKBENCH_SLOT, {
        runtimeScope: { projectId: options.projectId() }
      })
    )
    if (version !== revision || assistantId !== options.assistantId() || routeKey !== options.routeKey()) return false
    const manifest = findResolvedViewByKey(
      manifests.filter((item) => item.visible !== false).map((item) => ({ ...item, viewKey: item.key })),
      view.viewKey
    )
    if (!manifest || !canRenderViewInChatkit(manifest.view))
      throw new Error(`ChatKit view '${view.viewKey}' is not available.`)
    return options.url.setViewState(manifest.key, viewQuery(view))
  }

  const onNavigationChange = async (navigation: ChatKitWorkbenchNavigation) => {
    if (navigation.projectId !== options.projectId() || options.url.projectId()) return
    if (navigation.view && !options.isChatkitView(navigation.view.viewKey)) return
    revision++
    await options.url.setViewState(
      navigation.view?.viewKey ?? null,
      navigation.view ? viewQuery(navigation.view) : null,
      { closed: !navigation.view, ...(navigation.view?.layout ? { layout: navigation.view.layout } : {}) }
    )
  }
  return { state, openProject, openView, onNavigationChange }
}

function viewQuery(view: WorkbenchExtensionViewOpenRequest) {
  return {
    ...(view.selectionId ? { selectionId: view.selectionId } : {}),
    ...(view.parameters ? { parameters: view.parameters } : {})
  }
}
