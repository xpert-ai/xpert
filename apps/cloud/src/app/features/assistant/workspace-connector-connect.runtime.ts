// The iframe supplies identities only; resolve the workspace and permission using the host session.
import { Dialog, DialogRef } from '@angular/cdk/dialog'
import { DestroyRef, Injector, Signal, effect, inject } from '@angular/core'
import type { WorkspaceConnectorConnectHandler, WorkspaceConnectorConnectResult } from '@xpert-ai/chatkit-types'
import { firstValueFrom } from 'rxjs'
import { XpertConnectorService } from '../../@core/services/xpert-connector.service'
import { WORKSPACE_CONNECTOR_DIALOG } from '../xpert/workspace/connectors/workspace-connector-dialog'

export function injectWorkspaceConnectorConnect(assistantId: Signal<string | null>): WorkspaceConnectorConnectHandler {
  const injector = inject(Injector)
  const destroyRef = inject(DestroyRef)
  let active: { assistantId: string; bindingId: string; promise: Promise<WorkspaceConnectorConnectResult> } | undefined
  let dialogRef: DialogRef<WorkspaceConnectorConnectResult> | undefined
  effect(() => {
    const currentId = assistantId()
    if (active && active.assistantId !== currentId) dialogRef?.close({ status: 'cancelled' })
  })
  destroyRef.onDestroy(() => dialogRef?.close({ status: 'cancelled' }))

  return (request: unknown) => {
    if (
      !request ||
      typeof request !== 'object' ||
      !('assistantId' in request) ||
      typeof request.assistantId !== 'string' ||
      !('bindingId' in request) ||
      typeof request.bindingId !== 'string' ||
      !request.bindingId.trim() ||
      request.assistantId !== assistantId() ||
      destroyRef.destroyed
    ) {
      return Promise.reject(new Error('Invalid workspace connection request'))
    }
    const target = { assistantId: request.assistantId, bindingId: request.bindingId }
    if (active) {
      return active.assistantId === target.assistantId && active.bindingId === target.bindingId
        ? active.promise
        : Promise.reject(new Error('A workspace connection is already in progress'))
    }
    const isCurrent = () => !destroyRef.destroyed && assistantId() === target.assistantId
    const promise = (async (): Promise<WorkspaceConnectorConnectResult> => {
      const service = injector.get(XpertConnectorService)
      const options = await firstValueFrom(service.runtimeOptions(target.assistantId))
      if (!isCurrent()) return { status: 'cancelled' }
      const workspace = options.workspaceScope ?? options.scope
      const binding = options.items.find((item) => item.bindingId === target.bindingId)
      const scope = binding?.scope ?? options.scope
      if (
        workspace.type !== 'workspace' ||
        scope.type !== 'workspace' ||
        scope.workspaceId !== workspace.workspaceId ||
        !options.canManageWorkspace ||
        !binding?.canManage
      ) {
        throw new Error('Workspace connection configuration is not permitted')
      }
      if (binding.authorizationMode === 'shared' && binding.status === 'active' && binding.granted)
        return { status: 'connected' }
      const { XpertConnectorsComponent } = await import('../xpert/workspace/connectors/connectors.component')
      if (!isCurrent()) return { status: 'cancelled' }
      const context = Injector.create({
        parent: injector,
        providers: [
          {
            provide: WORKSPACE_CONNECTOR_DIALOG,
            useValue: { workspaceId: workspace.workspaceId, bindingId: binding.bindingId }
          }
        ]
      })
      try {
        dialogRef = injector.get(Dialog).open<WorkspaceConnectorConnectResult>(XpertConnectorsComponent, {
          injector: context,
          backdropClass: 'backdrop-blur-xs-black',
          panelClass: 'xp-overlay-pane-dialog',
          maxWidth: 'calc(100vw - 2rem)',
          maxHeight: '90dvh'
        })
        return (await firstValueFrom(dialogRef.closed, { defaultValue: undefined })) ?? { status: 'cancelled' }
      } finally {
        context.destroy()
      }
    })().finally(() => {
      active = undefined
      dialogRef = undefined
    })
    active = { ...target, promise }
    return promise
  }
}
