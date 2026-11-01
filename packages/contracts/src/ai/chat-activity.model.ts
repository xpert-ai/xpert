export type TChatConversationStatus = 'idle' | 'busy' | 'pausing' | 'paused' | 'interrupted' | 'error'

export interface IChatConversationUnreadXpertSummary {
  xpertId: string
  /** Includes running conversations other than the most recently updated one. */
  hasActiveRuns?: boolean
  unreadMessages: number
  unreadConversations: number
  latestUnreadAt?: Date | string | null
  latestUnreadConversationId?: string | null
  latestUnreadThreadId?: string | null
  latestConversationAt?: Date | string | null
  latestConversationId?: string | null
  latestConversationThreadId?: string | null
  latestConversationTitle?: string | null
  latestConversationStatus?: TChatConversationStatus | null
}

export interface IChatConversationUnreadSnapshot {
  version: string
  items: IChatConversationUnreadXpertSummary[]
}
