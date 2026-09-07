export type KnowledgeDeletionStatus =
  | 'prepared'
  | 'quiescing'
  | 'retracting'
  | 'external_cleanup'
  | 'finalizing'
  | 'completed'
  | 'failed'

export type KnowledgeDeletionRecoveryAction = {
  canRetry: boolean
  recommendedAction: 'wait' | 'retry'
}

export type KnowledgeDocumentDeletionReceipt = {
  intentId: string
  documentId: string
  status: KnowledgeDeletionStatus
  acceptedAt: Date
  completedAt?: Date | null
  failedStage?: string | null
  errorCode?: string | null
  canRetry: boolean
}

export type KnowledgebaseDeletionReceipt = {
  intentId: string
  knowledgebaseIdSnapshot: string
  status: KnowledgeDeletionStatus
  acceptedAt: Date
  completedAt?: Date | null
  failedStage?: string | null
  errorCode?: string | null
  canRetry: boolean
}
