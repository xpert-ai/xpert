// Onboarding has no Assistant yet. The server resolves the actor's reserved private
// workspace before the existing connector dialog receives a management context.
import { Dialog, DialogRef } from '@angular/cdk/dialog'
import { HttpClient } from '@angular/common/http'
import { DestroyRef, Injector, Signal, effect, inject } from '@angular/core'
import type { WorkspaceConnectorConnectResult } from '@xpert-ai/chatkit-types'
import { firstValueFrom } from 'rxjs'
import { API_PREFIX } from '../../@core/state'
import { WORKSPACE_CONNECTOR_DIALOG } from '../xpert/workspace/connectors/workspace-connector-dialog'

export function injectBosiConnectorConnect(workspaceId: Signal<string | null>, requestKey: Signal<string>) {
  const injector = inject(Injector)
  const http = inject(HttpClient)
  const destroy = inject(DestroyRef)
  let dialog: DialogRef<WorkspaceConnectorConnectResult> | undefined
  let activeKey: string | undefined
  effect(() => {
    const currentKey = requestKey()
    if (activeKey && currentKey !== activeKey) dialog?.close({ status: 'cancelled' })
  })
  destroy.onDestroy(() => dialog?.close({ status: 'cancelled' }))
  return async (input: { workspaceId: string; bindingId: string }): Promise<WorkspaceConnectorConnectResult> => {
    if (input.workspaceId !== workspaceId() || activeKey || destroy.destroyed)
      throw new Error('Invalid workspace connection request')
    const key = requestKey()
    activeKey = key
    const current = () => !destroy.destroyed && requestKey() === key && workspaceId() === input.workspaceId
    let context: ReturnType<typeof Injector.create> | undefined
    try {
      const target = await firstValueFrom(
        http.post<{ workspaceId: string; bindingId: string; connected: boolean }>(
          `${API_PREFIX}/assistant-binding/bosi/onboarding/connection/resolve`,
          input
        )
      )
      if (!current()) return { status: 'cancelled' }
      if (target.workspaceId !== input.workspaceId || target.bindingId !== input.bindingId)
        throw new Error('Invalid workspace connection response')
      if (target.connected) return { status: 'connected' }
      const { XpertConnectorsComponent } = await import('../xpert/workspace/connectors/connectors.component')
      if (!current()) return { status: 'cancelled' }
      context = Injector.create({
        parent: injector,
        providers: [
          {
            provide: WORKSPACE_CONNECTOR_DIALOG,
            useValue: {
              workspaceId: target.workspaceId,
              bindingId: target.bindingId,
              authorizationNavigation: 'current-tab'
            }
          }
        ]
      })
      dialog = injector.get(Dialog).open<WorkspaceConnectorConnectResult>(XpertConnectorsComponent, {
        injector: context,
        backdropClass: 'backdrop-blur-xs-black',
        panelClass: 'xp-overlay-pane-dialog',
        maxWidth: 'calc(100vw - 2rem)',
        maxHeight: '90dvh'
      })
      return (await firstValueFrom(dialog.closed, { defaultValue: undefined })) ?? { status: 'cancelled' }
    } finally {
      activeKey = undefined
      dialog = undefined
      context?.destroy()
    }
  }
}
