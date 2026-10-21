// The iframe supplies identities only; resolve the workspace and permission using the host session.
import { Dialog, DialogRef } from '@angular/cdk/dialog'
import { DestroyRef, Injector, Signal, effect, inject } from '@angular/core'
import { Router } from '@angular/router'
import type { WorkspaceConnectorConnectHandler, WorkspaceConnectorConnectResult } from '@xpert-ai/chatkit-types'
import { workspaceConnectorAuthorizationSchema } from '@xpert-ai/contracts'
import { firstValueFrom } from 'rxjs'
import { XpertConnectorService } from '../../@core/services/xpert-connector.service'
import { WORKSPACE_CONNECTOR_DIALOG } from '../xpert/workspace/connectors/workspace-connector-dialog'

export function injectWorkspaceConnectorConnect(
  assistantId: Signal<string | null>,
  options?: { authorizationNavigation?: 'current-tab'; requestKey?: Signal<string> }
): WorkspaceConnectorConnectHandler {
  const injector = inject(Injector)
  const destroyRef = inject(DestroyRef)
  let active:
    | {
        assistantId: string
        bindingId: string
        requestKey?: string
        requiredAuthMethodId?: string
        requiredIntegrationId?: string
        promise: Promise<WorkspaceConnectorConnectResult>
      }
    | undefined
  let dialogRef: DialogRef<WorkspaceConnectorConnectResult | 'manage'> | undefined
  effect(() => {
    const currentId = assistantId()
    const requestKey = options?.requestKey?.()
    if (active && (active.assistantId !== currentId || active.requestKey !== requestKey))
      dialogRef?.close({ status: 'cancelled' })
  })
  destroyRef.onDestroy(() => dialogRef?.close({ status: 'cancelled' }))

  return function connect(request: unknown): Promise<WorkspaceConnectorConnectResult> {
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
    const authorization = workspaceConnectorAuthorizationSchema.safeParse({
      authMethodId: 'requiredAuthMethodId' in request ? request.requiredAuthMethodId : undefined,
      integrationId: 'requiredIntegrationId' in request ? request.requiredIntegrationId : undefined
    })
    if (!authorization.success) return Promise.reject(new Error('Invalid connector authorization constraint'))
    const { authMethodId: requiredAuthMethodId, integrationId: requiredIntegrationId } = authorization.data
    const target = {
      assistantId: request.assistantId,
      bindingId: request.bindingId,
      requiredAuthMethodId,
      requiredIntegrationId
    }
    const requestKey = options?.requestKey?.()
    if (active) {
      if (active.requestKey !== requestKey) {
        dialogRef?.close({ status: 'cancelled' })
        return active.promise.catch(() => undefined).then(() => connect(request))
      }
      return active.assistantId === target.assistantId &&
        active.bindingId === target.bindingId &&
        active.requiredAuthMethodId === requiredAuthMethodId &&
        active.requiredIntegrationId === requiredIntegrationId
        ? active.promise
        : Promise.reject(new Error('A workspace connection is already in progress'))
    }
    const isCurrent = () =>
      !destroyRef.destroyed && assistantId() === target.assistantId && options?.requestKey?.() === requestKey
    const promise = (async (): Promise<WorkspaceConnectorConnectResult> => {
      const service = injector.get(XpertConnectorService)
      const runtimeOptions = await firstValueFrom(service.runtimeOptions(target.assistantId))
      if (!isCurrent()) return { status: 'cancelled' }
      const workspace = runtimeOptions.workspaceScope ?? runtimeOptions.scope
      const binding = runtimeOptions.items.find((item) => item.bindingId === target.bindingId)
      const scope = binding?.scope ?? runtimeOptions.scope
      if (
        workspace.type !== 'workspace' ||
        scope.type !== 'workspace' ||
        scope.workspaceId !== workspace.workspaceId ||
        !runtimeOptions.canManageWorkspace ||
        !binding?.canManage
      ) {
        throw new Error('Workspace connection configuration is not permitted')
      }
      if (
        !requiredAuthMethodId &&
        !requiredIntegrationId &&
        binding.authorizationMode === 'shared' &&
        binding.status === 'active' &&
        binding.granted
      )
        return { status: 'connected' }
      const component =
        binding.authorizationMode === 'personal'
          ? (await import('./workspace-connector-migration-dialog.component'))
              .WorkspaceConnectorMigrationDialogComponent
          : (await import('../xpert/workspace/connectors/connectors.component')).XpertConnectorsComponent
      if (!isCurrent()) return { status: 'cancelled' }
      const context = Injector.create({
        parent: injector,
        providers: [
          {
            provide: WORKSPACE_CONNECTOR_DIALOG,
            useValue: {
              workspaceId: workspace.workspaceId,
              bindingId: binding.bindingId,
              ...(requiredAuthMethodId ? { requiredAuthMethodId } : {}),
              ...(requiredIntegrationId ? { requiredIntegrationId } : {}),
              ...(options?.authorizationNavigation ? { authorizationNavigation: options.authorizationNavigation } : {})
            }
          }
        ]
      })
      try {
        dialogRef = injector.get(Dialog).open<WorkspaceConnectorConnectResult | 'manage'>(component, {
          injector: context,
          backdropClass: 'backdrop-blur-xs-black',
          panelClass: 'xp-overlay-pane-dialog',
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: '90dvh'
        })
        const result = await firstValueFrom(dialogRef.closed, { defaultValue: undefined })
        if (result === 'manage') {
          if (isCurrent()) await injector.get(Router).navigate(['/xpert/w', workspace.workspaceId, 'connectors'])
          return { status: 'cancelled' }
        }
        return result ?? { status: 'cancelled' }
      } finally {
        context.destroy()
      }
    })().finally(() => {
      active = undefined
      dialogRef = undefined
    })
    active = { ...target, requestKey, promise }
    return promise
  }
}
