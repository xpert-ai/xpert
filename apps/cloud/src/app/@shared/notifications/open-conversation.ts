import { Router } from '@angular/router'
import type { OpenConversationAction } from '@xpert-ai/contracts'

// Transient navigation intent. The resolver supplies the authorized conversation ID.
export const OPEN_CONVERSATION_NAVIGATION = Symbol('open_conversation')

export function openConversation(router: Router, action: OpenConversationAction) {
  return action.threadId
    ? router.navigate(['/chat/x', action.assistantId, 'c', action.threadId], { info: OPEN_CONVERSATION_NAVIGATION })
    : router.navigate(['/chat/c', action.conversationId])
}
