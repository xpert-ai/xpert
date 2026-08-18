import {
  WORKBENCH_ASSISTANT_CONVERSATION_TARGET,
  WORKBENCH_EXTENSION_VIEW_TARGET,
  WORKBENCH_KNOWLEDGEBASE_DOCUMENTS_TARGET,
  WORKBENCH_NAVIGATION_OPEN_COMMAND,
  type WorkbenchAssistantConversationOpenRequest,
  type WorkbenchExtensionViewOpenRequest,
  type XpertViewScalar
} from '@xpert-ai/contracts'
import { ViewClientCommandRegistry } from '../../@shared/view-extension/view-client-command-registry.service'

export {
  WORKBENCH_ASSISTANT_CONVERSATION_TARGET,
  WORKBENCH_EXTENSION_VIEW_TARGET,
  WORKBENCH_KNOWLEDGEBASE_DOCUMENTS_TARGET,
  type WorkbenchAssistantConversationOpenRequest,
  type WorkbenchExtensionViewOpenRequest,
  type WorkbenchNavigationOpenPayload,
  type WorkbenchNavigationOpenTarget
} from '@xpert-ai/contracts'

type WorkbenchNavigationOpenCommandOptions = {
  navigate?: (
    commands: string[],
    options?: { queryParams?: Record<string, string>; state?: Record<string, unknown> }
  ) => Promise<unknown> | unknown
  openAssistantConversation?: (request: WorkbenchAssistantConversationOpenRequest) => Promise<unknown> | unknown
  openWorkbenchView?: (request: WorkbenchExtensionViewOpenRequest) => Promise<unknown> | unknown
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

    if (
      target !== WORKBENCH_KNOWLEDGEBASE_DOCUMENTS_TARGET &&
      target !== WORKBENCH_ASSISTANT_CONVERSATION_TARGET &&
      target !== WORKBENCH_EXTENSION_VIEW_TARGET
    ) {
      return {
        success: false,
        code: 'unsupported_target',
        message: `Navigation target '${target}' is not supported.`
      }
    }

    const resourceId =
      target === WORKBENCH_ASSISTANT_CONVERSATION_TARGET
        ? getString(payload, 'conversationId')
        : target === WORKBENCH_EXTENSION_VIEW_TARGET
          ? getString(payload, 'viewKey')
          : getString(payload, 'knowledgebaseId')
    if (!resourceId) {
      return {
        success: false,
        code: 'bad_request',
        message:
          target === WORKBENCH_ASSISTANT_CONVERSATION_TARGET
            ? 'Conversation id is required.'
            : target === WORKBENCH_EXTENSION_VIEW_TARGET
              ? 'Workbench view key is required.'
              : 'Knowledgebase id is required.'
      }
    }

    if (target === WORKBENCH_EXTENSION_VIEW_TARGET) {
      if (!options.openWorkbenchView) {
        return {
          success: false,
          code: 'unsupported',
          message: 'Workbench view opening is not available in this host.'
        }
      }

      const selectionId = getString(payload, 'selectionId')
      const parameters = getScalarParameters(payload, 'parameters')
      await options.openWorkbenchView({
        viewKey: resourceId,
        ...(selectionId ? { selectionId } : {}),
        ...(parameters ? { parameters } : {})
      })

      return {
        success: true,
        status: 'opened',
        target,
        viewKey: resourceId,
        ...(selectionId ? { selectionId } : {}),
        ...(parameters ? { parameters } : {})
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

    const documentId = getString(payload, 'documentId')
    const parentId = getString(payload, 'parentId')
    const chunkId = getString(payload, 'chunkId')
    const page = getPositiveInteger(payload, 'page')
    const sourceBlockIds = getStringArray(payload, 'sourceBlockIds')
    const evidenceText = getString(payload, 'evidenceText')
    const queryParams: Record<string, string> = {}
    if (parentId) queryParams['parentId'] = parentId
    if (chunkId) queryParams['chunkId'] = chunkId
    if (page) {
      queryParams['view'] = 'analysis'
      queryParams['page'] = String(page)
    } else if (chunkId) {
      queryParams['view'] = 'chunks'
    }
    if (sourceBlockIds?.[0]) queryParams['block'] = sourceBlockIds[0]
    const navigationState = evidenceText
      ? {
          knowledgeEvidence: {
            text: evidenceText.slice(0, 4000),
            ...(chunkId ? { chunkId } : {}),
            ...(page ? { page } : {}),
            ...(sourceBlockIds?.length ? { sourceBlockIds } : {})
          }
        }
      : undefined
    await options.navigate(
      ['/xpert/knowledges', resourceId, 'documents', ...(documentId ? [documentId] : [])],
      Object.keys(queryParams).length || navigationState
        ? {
            ...(Object.keys(queryParams).length ? { queryParams } : {}),
            ...(navigationState ? { state: navigationState } : {})
          }
        : undefined
    )

    return {
      success: true,
      status: 'opened',
      target,
      knowledgebaseId: resourceId,
      ...(documentId ? { documentId } : {}),
      ...(parentId ? { parentId } : {}),
      ...(chunkId ? { chunkId } : {}),
      ...(page ? { page } : {}),
      ...(sourceBlockIds?.length ? { sourceBlockIds } : {})
    }
  })
}

function getScalarParameters(
  payload: unknown,
  key: string
): Record<string, XpertViewScalar | XpertViewScalar[]> | undefined {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined
  const value = (payload as Record<string, unknown>)[key]
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const parameters: Record<string, XpertViewScalar | XpertViewScalar[]> = {}
  for (const [parameterKey, item] of Object.entries(value)) {
    if (isScalar(item)) parameters[parameterKey] = item
    else if (Array.isArray(item) && item.every(isScalar)) parameters[parameterKey] = item
  }
  return Object.keys(parameters).length ? parameters : undefined
}

function isScalar(value: unknown): value is XpertViewScalar {
  return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function getString(payload: unknown, key: string) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return undefined
  }

  const value = (payload as Record<string, unknown>)[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function getPositiveInteger(payload: unknown, key: string) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined
  const value = (payload as Record<string, unknown>)[key]
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isInteger(number) && number > 0 ? number : undefined
}

function getStringArray(payload: unknown, key: string) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined
  const value = (payload as Record<string, unknown>)[key]
  if (!Array.isArray(value)) return undefined
  const items = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20)
  return items.length ? items : undefined
}
