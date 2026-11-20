export type ConversationProjectDestination = 'existing' | 'create'

export interface ConversationProjectMoveOffer {
  requestId: string
  assistantMessageId: string
  threadId: string
  /** Initial preference until confirmation, then the mode used to bind the Project. */
  destination: ConversationProjectDestination
  projectId: string | null
  projectName?: string
  executionId: string
  conversationId: string
  waitingForIdle: boolean
  executionStatus: string | null
}

export type ConversationProjectMoveConfirmation = {
  requestId: string
  moveFromConversationId: string
  threadId: string
  shareHistory: true
  target: { mode: 'existing'; projectId: string } | { mode: 'create'; name: string }
}
