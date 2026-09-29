import type { ChatKitWorkbenchOptions } from '@xpert-ai/chatkit-types'
import { AGENT_WORKBENCH_SLOT, type XpertViewRuntimeScopeInput } from '@xpert-ai/contracts'
import { firstValueFrom } from 'rxjs'
import type { ViewExtensionApiService } from '../../@core/services/view-extension-api.service'
import type { ViewClientCommandRegistry } from '../../@shared/view-extension/view-client-command-registry.service'

type ChatkitWorkbenchScope = {
  assistantId: string | null
  runtimeScope: XpertViewRuntimeScopeInput
}

/** Bridge embedded views to the same host commands used by platform Workbench views. */
export function createChatkitWorkbenchClientCommandHandler(options: {
  getScope: () => ChatkitWorkbenchScope
  views: Pick<ViewExtensionApiService, 'getSlotViews'>
  commands: Pick<ViewClientCommandRegistry, 'execute'>
}): NonNullable<ChatKitWorkbenchOptions['onClientCommand']> {
  return async (request) => {
    const scope = options.getScope()
    if (!scope.assistantId || request.hostType !== 'agent' || request.hostId !== scope.assistantId) {
      return { success: false, code: 'stale_context' }
    }

    // Re-resolve the server manifest; an iframe cannot grant itself host commands.
    const views = await firstValueFrom(
      options.views.getSlotViews('agent', scope.assistantId, AGENT_WORKBENCH_SLOT, {
        runtimeScope: scope.runtimeScope
      })
    )
    const current = options.getScope()
    if (
      current.assistantId !== scope.assistantId ||
      current.runtimeScope.projectId !== scope.runtimeScope.projectId ||
      current.runtimeScope.conversationId !== scope.runtimeScope.conversationId
    ) {
      return { success: false, code: 'stale_context' }
    }
    const manifest = views.find((view) => view.key === request.viewKey && view.visible !== false)
    if (!manifest?.clientCommands?.some((command) => command.key === request.commandKey)) {
      return { success: false, code: 'forbidden' }
    }
    return options.commands.execute(request.commandKey, request.payload, {
      hostType: 'agent',
      hostId: scope.assistantId,
      viewKey: manifest.key,
      manifest
    })
  }
}
