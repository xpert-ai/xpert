import type { I18nText } from '../../i18n.model'
import type { ApprovalDecision } from './release'
import type { EvolutionArtifactRef, EvolutionProviderContext, EvolutionScope } from './target'
import type { EvolutionInputKind, EvolutionStrategySnapshot, EvolutionStageRecord } from './strategy'

export interface EvolutionVersionRef {
  resourceId: string
  version: string
  hash: string
}
export interface EvolutionEvidenceRef {
  kind: 'document' | 'execution' | 'feedback' | 'evaluation' | 'artifact'
  subjectKey: string
  uri: string
  version: string
  hash: string
  locator?: { sourceId?: string; fragmentId?: string; quoteHash?: string }
}
export interface EvolutionChangeDelta {
  path: string
  operation: string
  summary: string
  before?: string
  after: string
}
export interface EvolutionChangeCandidate {
  artifact: EvolutionArtifactRef
  baseline: EvolutionVersionRef
  changes: EvolutionChangeDelta[]
  warnings: string[]
  summary: string
}
export interface EvolutionCheck {
  checkId: string
  title: string
  kind: string
  origin: string
  passed: boolean
  blocking: boolean
  details: string
  evidenceRefs: string[]
}
export interface EvolutionReadiness {
  key: string
  label: I18nText
  status: 'passed' | 'blocked' | 'unknown'
  reasons: string[]
}
export interface EvolutionChangeEvaluation {
  runId: string
  candidateHash: string
  baselineHash: string
  evidenceHash: string
  datasetVersion: string
  datasetHash: string
  checks: EvolutionCheck[]
  readiness: EvolutionReadiness[]
  passed: boolean
  completedAt: string
  strategyHash?: string
  assessment?: 'tested' | 'not_applicable'
  evaluationRuns?: Array<{ key: string; kind: string; runId: string }>
}
export interface EvolutionPublicationReceipt {
  receiptId: string
  changeId: string
  candidateHash: string
  approvalId: string
  resource: EvolutionVersionRef
  completedAt: string
}
export interface EvolutionWorkbenchLink {
  xpertId: string
  viewKey: string
  selectionId: string
  parameters: Record<string, string>
}
export interface EvolutionPresentationMetric {
  key: string
  label: I18nText
  value: string | number | null
  total?: number
}
export interface EvolutionChangePresentation {
  title: string
  resourceLabel: string
  contextLabel?: string
  description?: I18nText
  metrics?: EvolutionPresentationMetric[]
  effect?: { status: 'pending' | 'partial' | 'active' | 'unknown'; label: I18nText; description?: I18nText }
  workbench?: EvolutionWorkbenchLink
  historyWorkbench?: EvolutionWorkbenchLink
}
export type EvolutionChangeStatus =
  | 'preparing'
  | 'testing'
  | 'test_failed'
  | 'pending_approval'
  | 'approved'
  | 'publishing'
  | 'published'
  | 'rejected'
  | 'stale'
  | 'failed'
export interface EvolutionChange {
  contractVersion: 3
  strategy: EvolutionStrategySnapshot
  sourceKind: EvolutionInputKind
  learningEventIds: string[]
  candidateInput: Record<string, string | number | boolean | string[]>
  datasetSnapshotIds: Record<string, string>
  stages: EvolutionStageRecord[]
  changeId: string
  targetId: string
  requestId: string
  scope: EvolutionScope
  baseline: EvolutionVersionRef
  evidence: EvolutionEvidenceRef[]
  evidenceHash: string
  status: EvolutionChangeStatus
  candidate?: EvolutionChangeCandidate
  evaluation?: EvolutionChangeEvaluation
  approval?: ApprovalDecision
  receipt?: EvolutionPublicationReceipt
  jobId: string
  createdBy: string
  createdAt: string
  updatedAt: string
  failureReasons?: string[]
  presentation?: EvolutionChangePresentation
  presentationUnavailable?: boolean
}
export interface EvolutionChangeOperation {
  context: EvolutionProviderContext
  change: EvolutionChange
  evaluationStep?: import('./strategy').EvolutionEvaluationStep
}
export interface EvolutionChangeProvider {
  describe?(operation: EvolutionChangeOperation): Promise<EvolutionChangePresentation>
  prepare(operation: EvolutionChangeOperation): Promise<EvolutionChangeCandidate>
  evaluate(operation: EvolutionChangeOperation): Promise<EvolutionChangeEvaluation>
  validateCurrent(operation: EvolutionChangeOperation): Promise<{ valid: boolean; reasons: string[] }>
  authorizePublication(operation: EvolutionChangeOperation): Promise<void>
  publish(operation: EvolutionChangeOperation): Promise<EvolutionPublicationReceipt>
}
export interface EvolutionChangeIdentity {
  tenantId: string
  organizationId: string
}
export interface SubmitEvolutionChange extends EvolutionChangeIdentity {
  strategyId: string
  sourceKind: EvolutionInputKind
  learningEventIds?: string[]
  candidateInput?: Record<string, string | number | boolean | string[]>
  datasetSnapshotIds?: Record<string, string>
  targetId: string
  requestId: string
  scope: EvolutionScope
  baseline: EvolutionVersionRef
  evidence: EvolutionEvidenceRef[]
}
export interface EvolutionChangeRuntimeApi {
  prepare(input: SubmitEvolutionChange): Promise<EvolutionChange>
  get(input: EvolutionChangeIdentity & { changeId: string }): Promise<EvolutionChange>
  list(input: EvolutionChangeIdentity & { targetId?: string; requestId?: string }): Promise<EvolutionChange[]>
  decide(
    input: EvolutionChangeIdentity & {
      changeId: string
      candidateHash: string
      evaluationRunId: string
      decision: 'approved' | 'rejected'
      reason: string
    }
  ): Promise<EvolutionChange>
  publish(input: EvolutionChangeIdentity & { changeId: string }): Promise<EvolutionChange>
}

/** Assembled from canonical lifecycle entities; adapters retain their evaluation and release gates. */
export interface EvolutionLifecycleRecord {
  id: string
  targetId: string
  title: string
  scope: EvolutionScope
  phase: 'preparation' | 'evaluation' | 'review' | 'publication' | 'effective' | 'blocked' | 'closed'
  status: string
  createdAt: string
  updatedAt: string
  strategy: EvolutionStrategySnapshot
  stages: EvolutionStageRecord[]
  sourceKind: EvolutionInputKind
  releasePackageId?: string
  publicationStatus: 'preparing' | 'review' | 'publishing' | 'published' | 'closed' | 'blocked'
  effectStatus: 'pending' | 'partial' | 'active' | 'unknown'
  baseline: EvolutionVersionRef
  candidate?: EvolutionChangeCandidate
  evaluation?: EvolutionChangeEvaluation
  approvals: ApprovalDecision[]
  publication?: {
    status: string
    version?: EvolutionVersionRef
    receipt?: EvolutionPublicationReceipt
    publishedAt?: string
  }
  presentation?: EvolutionChangePresentation
  presentationUnavailable?: boolean
  job?: import('./governance').EvolutionJob
  capabilities: { stagedRollout: boolean; evaluate: boolean; decide: boolean; publish: boolean }
}
