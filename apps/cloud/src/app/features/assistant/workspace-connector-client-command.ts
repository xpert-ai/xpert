import { DestroyRef, Signal, inject } from '@angular/core'
import { firstValueFrom } from 'rxjs'
import { XpertConnectorService } from '../../@core/services/xpert-connector.service'
import { ViewClientCommandRegistry } from '../../@shared/view-extension/view-client-command-registry.service'
import { injectWorkspaceConnectorConnect } from './workspace-connector-connect.runtime'

/** Opens host-owned authorization; credentials never cross the remote view bridge. */
export function injectWorkspaceConnectorClientCommand(assistantId: Signal<string | null>) {
  const registry = inject(ViewClientCommandRegistry)
  const service = inject(XpertConnectorService)
  const destroyRef = inject(DestroyRef)
  const connect = injectWorkspaceConnectorConnect(assistantId)
  const unregister = registry.register(
    'workspace.connector.connect',
    async (payload, context) => {
      const id = assistantId()
      if (
        !id ||
        context.hostType !== 'agent' ||
        context.hostId !== id ||
        !payload ||
        typeof payload !== 'object' ||
        !('provider' in payload) ||
        typeof payload.provider !== 'string' ||
        !/^[a-z][a-z0-9_-]{0,63}$/.test(payload.provider)
      )
        return { success: false, code: 'invalid_payload' }
      const provider = payload.provider
      const options = await firstValueFrom(service.runtimeOptions(id))
      const scope = options.workspaceScope ?? options.scope
      if (scope.type !== 'workspace' || !options.canManageWorkspace)
        return { success: false, code: 'workspace_management_required' }
      if (destroyRef.destroyed || assistantId() !== id) return { success: false, code: 'context_changed' }
      const definitions = await firstValueFrom(service.scopedDefinitions('workspace', scope.workspaceId))
      if (destroyRef.destroyed || assistantId() !== id) return { success: false, code: 'context_changed' }
      if (!definitions.some((d) => d.provider === provider)) return { success: false, code: 'connector_not_installed' }
      const bindings = await firstValueFrom(service.listBindings('workspace', scope.workspaceId))
      if (destroyRef.destroyed || assistantId() !== id) return { success: false, code: 'context_changed' }
      // A legacy personal binding still occupies this provider's workspace slot.
      // Let the host show its migration guidance instead of attempting a duplicate create.
      const binding =
        bindings.find((b) => b.provider === provider) ??
        (await firstValueFrom(service.createBinding({ scope, provider, authorizationMode: 'shared' })))
      if (destroyRef.destroyed || assistantId() !== id) return { success: false, code: 'context_changed' }
      const result = await connect({ assistantId: id, bindingId: binding.id })
      return { success: true, data: result }
    },
    () => !!assistantId() && !destroyRef.destroyed
  )
  destroyRef.onDestroy(unregister)
}
