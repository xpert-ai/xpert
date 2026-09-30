import type { ChatKitWorkbenchOptions, ChatKitWorkbenchClientCommandRequest } from '@xpert-ai/chatkit-types'
import { AGENT_WORKBENCH_SLOT, parseResourceCardContent, type XpertViewRuntimeScopeInput } from '@xpert-ai/contracts'
import type { ChatConversationService } from '../../@core/services/chat-conversation.service'
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
  conversations?: Pick<ChatConversationService, 'getMessages'>
}): NonNullable<ChatKitWorkbenchOptions['onClientCommand']> {
  return async (
    request: ChatKitWorkbenchClientCommandRequest & {
      resourceCard?: { messageId: string; id: string }
    }
  ) => {
    const scope = options.getScope()
    if (!scope.assistantId || request.hostType !== 'agent' || request.hostId !== scope.assistantId) {
      return { success: false, code: 'stale_context' }
    }

    // Card clicks carry a persisted identity, never authority to invent a navigation target.
    let payload = request.payload
    let viewKey = request.viewKey
    let manifestScope = scope.runtimeScope
    const receipt = request.resourceCard
    if (receipt) {
      if (
        request.commandKey !== 'workbench.navigation.open' ||
        !scope.runtimeScope.conversationId ||
        !options.conversations
      )
        return { success: false, code: 'forbidden' }
      const history = await firstValueFrom(options.conversations.getMessages(scope.runtimeScope.conversationId))
      const message = history.items.find(
        (item) => item.id === receipt.messageId && ['ai', 'assistant'].includes(item.role)
      )
      const card = (Array.isArray(message?.content) ? message.content : [])
        .map(parseResourceCardContent)
        .find((item) => item?.id === receipt.id)
      if (!card) return { success: false, code: 'forbidden' }
      payload = card.data.open
      viewKey = card.data.open.viewKey
      if (card.data.open.target === 'assistant.project') {
        manifestScope = { projectId: card.data.open.projectId }
      }
    }
    // Re-resolve the server manifest; an iframe cannot grant itself host commands.
    const views = await firstValueFrom(
      options.views.getSlotViews('agent', scope.assistantId, AGENT_WORKBENCH_SLOT, {
        runtimeScope: manifestScope
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
    const manifest = views.find((view) => view.key === viewKey && view.visible !== false)
    if (
      !manifest ||
      (!request.resourceCard && !manifest.clientCommands?.some((command) => command.key === request.commandKey))
    ) {
      return { success: false, code: 'forbidden' }
    }
    return options.commands.execute(request.commandKey, payload, {
      hostType: 'agent',
      hostId: scope.assistantId,
      viewKey: manifest.key,
      manifest
    })
  }
}
