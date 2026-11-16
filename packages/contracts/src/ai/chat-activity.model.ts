export type TChatConversationStatus = 'idle' | 'busy' | 'pausing' | 'paused' | 'interrupted' | 'error'

export interface IChatConversationUnreadXpertSummary {
  xpertId: string
  /** Includes running conversations other than the most recently updated one. */
  hasActiveRuns?: boolean
  /** Total private threads waiting for a human response, including those outside the preview. */
  pendingThreadCount?: number
  /** Pending threads in the bounded preview. Rank is one-based across the requested Assistants, newest first. */
  pendingThreads?: { threadId: string; kind: 'question' | 'approval'; rank?: number }[]
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
