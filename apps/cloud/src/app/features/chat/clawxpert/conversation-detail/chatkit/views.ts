import { effect, inject, signal } from '@angular/core'
import { AGENT_WORKBENCH_SLOT, type XpertViewRuntimeScopeInput, type XpertViewSchema } from '@xpert-ai/contracts'
import { firstValueFrom } from 'rxjs'
import { ViewExtensionApiService } from '../../../../../@core'
import { canRenderViewInChatkit } from '../workspace/fixed-views'

/** Resolve navigation only from the current authorized scope, never a previous Project's manifests. */
export function injectChatkitWorkbenchViews(options: {
  hostId: () => string | null
  scope: () => XpertViewRuntimeScopeInput
}) {
  const api = inject(ViewExtensionApiService)
  const views = signal<{ viewKey: string; view: XpertViewSchema }[]>([])
  effect((onCleanup) => {
    const hostId = options.hostId()
    const runtimeScope = options.scope()
    views.set([])
    if (!hostId) return
    let cancelled = false
    void firstValueFrom(api.getSlotViews('agent', hostId, AGENT_WORKBENCH_SLOT, { runtimeScope }))
      .then((manifests) => {
        if (!cancelled)
          views.set(
            manifests
              .filter((manifest) => manifest.visible !== false && canRenderViewInChatkit(manifest.view))
              .map((manifest) => ({ viewKey: manifest.key, view: manifest.view }))
          )
      })
      .catch(() => {
        /* Unavailable Views must not be offered to the embedded runtime. */
      })
    onCleanup(() => {
      cancelled = true
    })
  })
  return views.asReadonly()
}
