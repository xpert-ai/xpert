import {
  WORKBENCH_ASSISTANT_CONVERSATION_TARGET,
  WORKBENCH_KNOWLEDGEBASE_DOCUMENTS_TARGET,
  WORKBENCH_NAVIGATION_OPEN_COMMAND,
  type WorkbenchAssistantConversationOpenRequest
} from '@xpert-ai/contracts'
import { ViewClientCommandRegistry } from '../../@shared/view-extension/view-client-command-registry.service'

export {
  WORKBENCH_ASSISTANT_CONVERSATION_TARGET,
  WORKBENCH_KNOWLEDGEBASE_DOCUMENTS_TARGET,
  type WorkbenchAssistantConversationOpenRequest,
  type WorkbenchNavigationOpenPayload,
  type WorkbenchNavigationOpenTarget
} from '@xpert-ai/contracts'

type WorkbenchNavigationOpenCommandOptions = {
  navigate?: (commands: string[]) => Promise<unknown> | unknown
  openAssistantConversation?: (request: WorkbenchAssistantConversationOpenRequest) => Promise<unknown> | unknown
}

export function registerWorkbenchNavigationOpenCommand(
  registry: ViewClientCommandRegistry,
  options: WorkbenchNavigationOpenCommandOptions = {}
) {
  return registry.register(WORKBENCH_NAVIGATION_OPEN_COMMAND, async (payload) => {
    const target = getString(payload, 'target')
    if (!target) {
      return {
        success: false,
        code: 'bad_request',
        message: 'Navigation target is required.'
      }
    }

    if (target !== WORKBENCH_KNOWLEDGEBASE_DOCUMENTS_TARGET && target !== WORKBENCH_ASSISTANT_CONVERSATION_TARGET) {
      return {
        success: false,
        code: 'unsupported_target',
        message: `Navigation target '${target}' is not supported.`
      }
    }

    const resourceId =
      target === WORKBENCH_ASSISTANT_CONVERSATION_TARGET
        ? getString(payload, 'conversationId')
        : getString(payload, 'knowledgebaseId')
    if (!resourceId) {
      return {
        success: false,
        code: 'bad_request',
        message:
          target === WORKBENCH_ASSISTANT_CONVERSATION_TARGET
            ? 'Conversation id is required.'
            : 'Knowledgebase id is required.'
      }
    }

    if (target === WORKBENCH_ASSISTANT_CONVERSATION_TARGET) {
      if (!options.openAssistantConversation) {
        return {
          success: false,
          code: 'unsupported',
          message: 'Assistant conversation opening is not available in this host.'
        }
      }

      const threadId = getString(payload, 'threadId')
      const executionId = getString(payload, 'executionId')
      await options.openAssistantConversation({
        conversationId: resourceId,
        ...(threadId ? { threadId } : {}),
        ...(executionId ? { executionId } : {})
      })

      return {
        success: true,
        status: 'opened',
        target,
        conversationId: resourceId,
        ...(threadId ? { threadId } : {}),
        ...(executionId ? { executionId } : {})
      }
    }

    if (!options.navigate) {
      return {
        success: false,
        code: 'unsupported',
        message: 'Workbench navigation is not available in this host.'
      }
    }

    await options.navigate(['/xpert/knowledges', resourceId, 'documents'])

    return {
      success: true,
      status: 'opened',
      target,
      knowledgebaseId: resourceId
    }
  })
}

function getString(payload: unknown, key: string) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return undefined
  }

  const value = (payload as Record<string, unknown>)[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
