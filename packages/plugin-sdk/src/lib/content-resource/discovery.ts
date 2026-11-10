import type { ConversationResourcePage, ConversationResourceQuery } from '@xpert-ai/contracts'
import type { ContentDocumentScope } from './document'

/** Host-resolved scope supplied by a View or admitted Assistant invocation, never remote-component/tool input. */
export interface ConversationResourceScope extends ContentDocumentScope {
  /** Optional for ordinary Project browsing; required to discover an accepted group reference. */
  conversationId?: string | null
}

export interface ConversationResourcesApi {
  /** Combines authorized Project content and current-group references without registering/copying shared content. */
  list(scope: ConversationResourceScope, query: ConversationResourceQuery): Promise<ConversationResourcePage>
}
