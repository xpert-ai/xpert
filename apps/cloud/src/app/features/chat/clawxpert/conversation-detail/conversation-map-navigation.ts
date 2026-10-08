import { Clipboard } from '@angular/cdk/clipboard'
import { effect, inject, untracked } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { NavigationEnd, Router } from '@angular/router'
import { filter, map, startWith } from 'rxjs'
import { firstValueFrom } from 'rxjs'
import { ChatConversationService } from '../../../../@core/services/chat-conversation.service'
import { ViewClientCommandRegistry } from '../../../../@shared/view-extension/view-client-command-registry.service'
import type { WorkbenchAssistantConversationOpenRequest } from '@xpert-ai/contracts'

type MessageFocusResult = { success: boolean; code?: string; message?: string }
type MessageFocusControl = {
  focusMessage: (request: {
    conversationId: string
    threadId: string
    messageId: string
  }) => Promise<MessageFocusResult>
}
function canFocus(control: unknown): control is MessageFocusControl {
  return Boolean(
    control && typeof control === 'object' && 'focusMessage' in control && typeof control.focusMessage === 'function'
  )
}
export async function focusConversationMapMessage(
  control: unknown,
  request: { conversationId: string; threadId: string; messageId?: string }
) {
  if (!request.messageId) return
  if (!canFocus(control)) throw new Error('This ChatKit build does not support message navigation.')
  const anchor = { ...request, messageId: request.messageId }
  let result = await control.focusMessage(anchor)
  // A newly mounted frame can acknowledge commands before its message surface registers.
  // Retry only that explicit readiness response, never an authorization or history failure.
  const deadline = Date.now() + 5000
  while (!result.success && result.code === 'not_ready' && Date.now() < deadline) {
    await new Promise<void>((resolve) => setTimeout(resolve, 100))
    result = await control.focusMessage(anchor)
  }
  if (!result.success) {
    if (result.code === 'stale_context') throw new DOMException('Message navigation was superseded.', 'AbortError')
    throw new Error(result.message || result.code || 'Message navigation failed.')
  }
}

/** Link resolution always goes through the same authorized navigation endpoint as a map click. */
export function installConversationMapLinks(options: {
  ready: () => boolean
  assistantId: () => string | null
  open: (request: WorkbenchAssistantConversationOpenRequest) => Promise<unknown>
  onError: (error: unknown) => void
}) {
  const router = inject(Router)
  const clipboard = inject(Clipboard)
  const conversations = inject(ChatConversationService)
  const registry = inject(ViewClientCommandRegistry)
  const url = toSignal(
    router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      startWith(null),
      map(() => router.url)
    ),
    { initialValue: router.url }
  )
  let handled: string | null = null
  effect(() => {
    const current = url()
    if (!options.ready() || !options.assistantId()) return
    const query = router.parseUrl(current).queryParamMap
    const conversationId = query.get('mapConversation')
    const threadId = query.get('mapThread')
    const messageId = query.get('mapMessage')
    if (!conversationId || !threadId) {
      handled = null
      return
    }
    const key = JSON.stringify([options.assistantId(), conversationId, threadId, messageId])
    if (key === handled) return
    handled = key
    untracked(() => {
      void options
        .open({ conversationId, threadId, ...(messageId ? { messageId } : {}), preserveView: true })
        .catch((error: unknown) => {
          // Opening another branch deliberately supersedes the initial link location.
          if (!(error instanceof Error && error.name === 'AbortError')) options.onError(error)
        })
    })
  })
  return registry.register('workbench.navigation.copy-link', async (payload) => {
    const assistantId = options.assistantId()
    if (
      !assistantId ||
      !payload ||
      typeof payload !== 'object' ||
      !('conversationId' in payload) ||
      typeof payload.conversationId !== 'string' ||
      !('threadId' in payload) ||
      typeof payload.threadId !== 'string'
    )
      return { success: false, code: 'bad_request' }
    const messageId = 'messageId' in payload && typeof payload.messageId === 'string' ? payload.messageId : undefined
    const target = await firstValueFrom(
      conversations.resolveWorkbenchNavigation(payload.conversationId, assistantId, undefined, {
        threadId: payload.threadId,
        messageId
      })
    )
    const link = new URL(router.url, window.location.origin)
    link.searchParams.set('mapConversation', target.conversationId)
    link.searchParams.set('mapThread', target.threadId)
    if (target.messageId) link.searchParams.set('mapMessage', target.messageId)
    else link.searchParams.delete('mapMessage')
    return clipboard.copy(link.href)
      ? { success: true, status: 'copied' }
      : { success: false, code: 'clipboard_unavailable' }
  })
}
