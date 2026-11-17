import type { EvolutionFeedbackExecution } from './provider'
import type { LearningEventInput } from './learning-event'
import type { EvolutionRuntimeObservationInput } from './runtime'

export type ExecutionReviewDisposition = 'confirmed' | 'corrected' | 'insufficient'
export type ExecutionReviewUse = 'case_only' | 'similar_cases'
export interface ExecutionReviewDecision {
  disposition: ExecutionReviewDisposition
  expectedLabel?: string
  reason?: string
  use: ExecutionReviewUse
}
export interface ExecutionReviewSubmission extends ExecutionReviewDecision {
  executionId: string
  bundleHash: string
}
export interface ExecutionReviewReceipt extends ExecutionReviewDecision {
  receiptId: string
  executionId: string
  originalLabel: string
  versionId: string
  reviewerId: string
  reviewedAt: string
  learningEventId?: string
}
export interface ExecutionReviewSnapshot {
  originalLabel: string
  versionId: string
  bundleHash: string
  sourceMessageId?: string
}
export interface ExecutionReviewItem extends ExecutionReviewSnapshot {
  executionId: string
  conversationId: string
  threadId: string
  sourceText: string | null
  createdAt: string
  receipt?: ExecutionReviewReceipt
}
export type ExecutionReviewQueue = 'pending' | 'reviewed' | 'insufficient'
export interface ExecutionReviewQuery {
  queue: ExecutionReviewQueue
  page: number
  pageSize: number
}
export interface ExecutionReviewApi {
  list(target: string, query: ExecutionReviewQuery): Promise<{ items: ExecutionReviewItem[]; total: number }>
  get(target: string, executionId: string): Promise<ExecutionReviewItem>
  submit(target: string, input: ExecutionReviewSubmission): Promise<ExecutionReviewReceipt>
}
/** Domain interpretation of an execution and the human feedback on that decision. */
export interface ExecutionReviewAdapter {
  readonly feature: string
  snapshot(execution: EvolutionFeedbackExecution): ExecutionReviewSnapshot
  sourceMatches(execution: EvolutionFeedbackExecution, text: string): boolean
  prepare(
    execution: EvolutionFeedbackExecution,
    decision: ExecutionReviewDecision,
    context: {
      organizationId: string
      conversationId: string
      reviewedAt: string
    }
  ): { event?: LearningEventInput; observations: EvolutionRuntimeObservationInput[] }
  matchesLegacy(input: unknown, receipt: ExecutionReviewReceipt): boolean
  legacyKey(executionId: string): string
}
