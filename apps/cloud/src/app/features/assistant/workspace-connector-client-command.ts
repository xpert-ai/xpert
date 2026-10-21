import { DestroyRef, Signal, inject } from '@angular/core'
import { firstValueFrom } from 'rxjs'
import { workspaceConnectorConnectPayloadSchema } from '@xpert-ai/contracts'
import { getConnectorAuthMethods } from '@xpert-ai/plugin-sdk/connector'
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
      const parsed = workspaceConnectorConnectPayloadSchema.safeParse(payload)
      if (!id || context.hostType !== 'agent' || context.hostId !== id || !parsed.success)
        return { success: false, code: 'invalid_payload' }
      const { provider, authMethodId, integrationId } = parsed.data
      const options = await firstValueFrom(service.runtimeOptions(id))
      const scope = options.workspaceScope ?? options.scope
      if (scope.type !== 'workspace' || !options.canManageWorkspace)
        return { success: false, code: 'workspace_management_required' }
      if (destroyRef.destroyed || assistantId() !== id) return { success: false, code: 'context_changed' }
      const definitions = await firstValueFrom(service.scopedDefinitions('workspace', scope.workspaceId))
      if (destroyRef.destroyed || assistantId() !== id) return { success: false, code: 'context_changed' }
      const definition = definitions.find((d) => d.provider === provider)
      if (!definition || definition.unavailable) return { success: false, code: 'connector_not_installed' }
      const method = authMethodId
        ? getConnectorAuthMethods(definition).find((m) => m.id === authMethodId && !m.deprecated)
        : undefined
      if (authMethodId && !method) return { success: false, code: 'connector_auth_method_unavailable' }
      if (integrationId && method) {
        const credentials = method.type === 'oauth2' ? method.appCredentials : method.credentials
        if (!credentials?.integration) return { success: false, code: 'connector_integration_unsupported' }
        const integrations = await firstValueFrom(service.integrationOptions(scope.workspaceId, provider, method.id))
        if (destroyRef.destroyed || assistantId() !== id) return { success: false, code: 'context_changed' }
        if (!integrations.some((item) => item.id === integrationId))
          return { success: false, code: 'connector_integration_unavailable' }
      }
      const bindings = await firstValueFrom(service.listBindings('workspace', scope.workspaceId))
      if (destroyRef.destroyed || assistantId() !== id) return { success: false, code: 'context_changed' }
      // A legacy personal binding still occupies this provider's workspace slot.
      // Let the host show its migration guidance instead of attempting a duplicate create.
      const binding =
        bindings.find((b) => b.provider === provider) ??
        (await firstValueFrom(service.createBinding({ scope, provider, authorizationMode: 'shared' })))
      if (destroyRef.destroyed || assistantId() !== id) return { success: false, code: 'context_changed' }
      if (
        (binding.status === 'active' || binding.status === 'pending') &&
        ((authMethodId && binding.authMethodId !== authMethodId) ||
          (integrationId && binding.appIntegrationId !== integrationId))
      )
        return { success: false, code: 'connector_connection_mismatch' }
      const result = await connect({
        assistantId: id,
        bindingId: binding.id,
        ...(authMethodId ? { requiredAuthMethodId: authMethodId } : {}),
        ...(integrationId ? { requiredIntegrationId: integrationId } : {})
      })
      return { success: true, data: result }
    },
    () => !!assistantId() && !destroyRef.destroyed
  )
  destroyRef.onDestroy(unregister)
}
