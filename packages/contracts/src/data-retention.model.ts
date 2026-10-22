export type ManualRetentionTarget = 'copilot_checkpoint' | 'model_gateway_call'

export interface ManualRetentionRange {
  target: ManualRetentionTarget
  /** Inclusive ISO timestamp. */
  start: string
  /** Exclusive ISO timestamp. */
  end: string
}

export interface ManualRetentionPreview extends ManualRetentionRange {
  previewToken: string
  expiresAt: string
  scope: 'all_tenants'
  matchedCount: number
  protectedCount: number
  eligibleCount: number
  selectedCount: number
  relatedWriteCount: number
  batchLimit: number
}

export interface ManualRetentionResult {
  deletedCount: number
  deletedWriteCount: number
  skippedCount: number
}
