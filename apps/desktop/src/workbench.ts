import { isAudioCaptureCommand } from '@xpert-ai/desktop-protocol'
import type { ChatKitWorkbenchClientCommandRequest } from '@xpert-ai/chatkit-types'
import { platformCommandUrl } from '../electron/workbench-platform.mjs'
import { invoke, HostError } from './host'
import type { WorkbenchSession } from './types'

function value(payload: unknown, key: string): string | undefined {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined
  const item: unknown = Reflect.get(payload, key)
  return typeof item === 'string' && item.trim() ? item.trim() : undefined
}

export function createWorkbenchHandler(botId: string, webUrl: string, onSession: (session: WorkbenchSession) => void) {
  let lastSessionScope: string | undefined
  let activeAssistantId: string | undefined
  return async (request: ChatKitWorkbenchClientCommandRequest) => {
    const { commandKey, payload } = request
    try {
      if (isAudioCaptureCommand(commandKey)) {
        if (!window.xpertDesktop?.audioCapture) return { success: false, code: 'desktop_required' }
        // Activation is supplied by ChatKit's trusted shell, never by an iframe payload.
        const userActivated = 'userActivated' in request && request.userActivated === true
        return window.xpertDesktop.audioCapture({
          botId,
          hostId: request.hostId,
          viewKey: request.viewKey,
          commandKey,
          payload,
          userActivated
        })
      }
      if (commandKey === 'workbench.navigation.open') {
        const target = value(payload, 'target')
        if (target === 'assistant.conversation' || target === 'assistant.project') {
          const session = await invoke('workbenchSession', {
            botId,
            target,
            // Only the authenticated host response may change the active Assistant.
            ...(target === 'assistant.project' ? { assistantId: activeAssistantId } : {}),
            conversationId: value(payload, 'conversationId'),
            projectId: value(payload, 'projectId'),
            threadId: value(payload, 'threadId')
          })
          activeAssistantId = session.assistantId
          const scope = JSON.stringify([
            session.assistantId,
            session.projectId,
            session.threadId,
            session.organizationId
          ])
          if (scope !== lastSessionScope) {
            onSession(session)
            lastSessionScope = scope
          }
          // ChatKit consumes this host-only response and strips credentials from the plugin result.
          return { success: true, session }
        }
      }
      if (commandKey === 'workbench.navigation.open' || commandKey === 'platform.data-source.create') {
        const navigation = commandKey === 'platform.data-source.create' ? { target: commandKey } : payload
        const url = platformCommandUrl(webUrl, navigation)
        if (!url) return { success: false, code: 'unsupported_target' }
        let opened: boolean
        if (window.xpertDesktop) opened = await window.xpertDesktop.openPlatform(navigation)
        else {
          const tab = window.open('about:blank', '_blank')
          opened = Boolean(tab)
          if (tab) {
            tab.opener = null
            tab.location.href = url
          }
        }
        // Opening platform management does not claim that a data source has been created.
        return opened
          ? { success: true, status: 'opened', external: true }
          : { success: false, code: 'navigation_cancelled' }
      }
      return { success: false, code: 'unsupported', commandKey }
    } catch (error) {
      return {
        success: false,
        code: error instanceof HostError && error.status === 403 ? 'forbidden' : 'navigation_failed',
        message: error instanceof Error ? error.message : undefined
      }
    }
  }
}
