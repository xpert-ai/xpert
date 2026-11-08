import type { I18nText } from '../../i18n.model'
import type { ApprovalDecision } from './release'
import type { EvolutionArtifactRef, EvolutionProviderContext, EvolutionScope } from './target'
import type { EvolutionInputKind, EvolutionStrategySnapshot, EvolutionStageRecord } from './strategy'

/** Provider-owned resource version and content hash; a resource ID alone does not identify reviewed content. */
export interface EvolutionVersionRef {
  resourceId: string
  version: string
  hash: string
}
/** Versioned evidence supporting a change, with an optional locator for the cited part. */
export interface EvolutionEvidenceRef {
  kind: 'document' | 'execution' | 'feedback' | 'evaluation' | 'artifact'
  subjectKey: string
  uri: string
  version: string
  hash: string
  locator?: { sourceId?: string; fragmentId?: string; quoteHash?: string }
}
/** One provider-defined change to a resource; path and operation follow the target's own vocabulary. */
export interface EvolutionChangeDelta {
  path: string
  operation: string
  summary: string
  before?: string
  after: string
}
/** Reviewable artifact and proposed differences relative to the identified baseline. */
export interface EvolutionChangeCandidate {
  artifact: EvolutionArtifactRef
  baseline: EvolutionVersionRef
  changes: EvolutionChangeDelta[]
  warnings: string[]
  summary: string
}
/** One evaluation judgment with a declared origin; a failed blocking check prevents the evaluation from passing. */
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
/** Assessment of a named readiness condition; unknown is distinct from a confirmed failure. */
export interface EvolutionReadiness {
  key: string
  label: I18nText
  status: 'passed' | 'blocked' | 'unknown'
  reasons: string[]
}
/** Assessment bound to the specific candidate, baseline and evidence that were evaluated. */
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
  /** Distinguishes completed testing from a strategy with no applicable tests. */
  assessment?: 'tested' | 'not_applicable'
  /** Individual strategy-step runs contributing to this assessment, when recorded. */
  evaluationRuns?: Array<{ key: string; kind: string; runId: string }>
}
/** Binds a published resource version to the candidate content and approval that authorized it. */
export interface EvolutionPublicationReceipt {
  receiptId: string
  changeId: string
  candidateHash: string
  approvalId: string
  resource: EvolutionVersionRef
  completedAt: string
}
/** Provider-defined destination for a particular business resource in an Assistant's Workbench. */
export interface EvolutionWorkbenchLink {
  xpertId: string
  viewKey: string
  selectionId: string
  parameters: Record<string, string>
}
/** Provider-defined metric; null represents an unavailable value rather than zero. */
export interface EvolutionPresentationMetric {
  kind?: 'adoption'
  key: string
  label: I18nText
  value: string | number | null
  total?: number
}
/** Provider-owned explanation of the business rationale, evidence and changes; display text has no governance semantics. */
export interface EvolutionChangeBusinessDetails {
  title: I18nText
  baselineLabel?: I18nText
  validationHint?: I18nText
  proposal?: I18nText
  rationale?: I18nText
  context: Array<{ key: string; label: I18nText; value?: string }>
  evidence: Array<{
    key: string
    documentName?: string
    page?: number
    location?: string
    quote?: string
    document?: { knowledgebaseId: string; documentId: string }
  }>
  changes: Array<{ key: string; label: I18nText; before?: I18nText; after: I18nText }>
  adoption?: { subjectLabel: I18nText; adopted: number; total: number }
}
/** Domain description of a change and its observed effect, separate from its approval and publication state. */
export interface EvolutionChangePresentation {
  title: string
  resourceLabel: string
  contextLabel?: string
  description?: I18nText
  business?: EvolutionChangeBusinessDetails
  metrics?: EvolutionPresentationMetric[]
  effect?: { status: 'pending' | 'partial' | 'active' | 'unknown'; label: I18nText; description?: I18nText }
  workbench?: EvolutionWorkbenchLink
  historyWorkbench?: EvolutionWorkbenchLink
}
/** Governance state of a change; publication alone does not imply adoption by every subject. */
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
/** Scoped record of a proposed change, binding its strategy, baseline, evidence and subsequent decisions. */
export interface EvolutionChange {
  contractVersion: 3
  strategy: EvolutionStrategySnapshot
  sourceKind: EvolutionInputKind
  learningEventIds: string[]
  candidateInput: Record<string, string | number | boolean | string[]>
  /** Frozen dataset IDs keyed by evaluation step key, not by target or candidate ID. */
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
  /** Optional context linking this change to the initiating Assistant's execution history. */
  executionContext?: EvolutionExecutionContext
  executionConversation?: EvolutionExecutionConversation
}
/** Context of the initiating Assistant for recording change activity in its execution history. */
export interface EvolutionExecutionContext {
  xpertId: string
  projectId?: string
  title: string
  input: string
  language?: string
}
/** Conversation, thread and execution references for the change's execution history. */
export interface EvolutionExecutionConversation {
  conversationId: string
  threadId: string
  executionId: string
}
/** Trusted provider context and the specific change under consideration. */
export interface EvolutionChangeOperation {
  context: EvolutionProviderContext
  change: EvolutionChange
  /** Strategy step under assessment, when the operation is step-specific. */
  evaluationStep?: import('./strategy').EvolutionEvaluationStep
}
/** Target-owned responsibilities for drafting, checking and publishing domain resource versions. */
export interface EvolutionChangeProvider {
  /** Provides domain presentation and effect information without changing the governance decision. */
  describe?(operation: EvolutionChangeOperation): Promise<EvolutionChangePresentation>
  /** Produces an artifact and reviewable differences against the specified baseline. */
  prepare(operation: EvolutionChangeOperation): Promise<EvolutionChangeCandidate>
  /** Returns checks bound to the candidate, baseline and evidence under assessment. */
  evaluate(operation: EvolutionChangeOperation): Promise<EvolutionChangeEvaluation>
  /** Reports whether the change's reviewed inputs are still current for the target. */
  validateCurrent(operation: EvolutionChangeOperation): Promise<{ valid: boolean; reasons: string[] }>
  /** Enforces target-specific authority to publish; approval alone does not grant that authority. */
  authorizePublication(operation: EvolutionChangeOperation): Promise<void>
  /** Publishes the approved resource version and returns evidence identifying what was written. */
  publish(operation: EvolutionChangeOperation): Promise<EvolutionPublicationReceipt>
}
/** Tenant and organization that bound a change operation; their IDs do not grant access. */
export interface EvolutionChangeIdentity {
  tenantId: string
  organizationId: string
}
/** Requests a scoped change under an explicit strategy, baseline and set of evidence references. */
export interface SubmitEvolutionChange extends EvolutionChangeIdentity {
  executionContext?: EvolutionExecutionContext
  strategyId: string
  sourceKind: EvolutionInputKind
  learningEventIds?: string[]
  candidateInput?: Record<string, string | number | boolean | string[]>
  /** Optional frozen dataset bindings keyed by evaluation step key. */
  datasetSnapshotIds?: Record<string, string>
  targetId: string
  /** Caller-supplied identity of the logical submission across retries. */
  requestId: string
  scope: EvolutionScope
  baseline: EvolutionVersionRef
  evidence: EvolutionEvidenceRef[]
}
/** Plugin-facing contract for scoped change preparation, review and publication. */
export interface EvolutionChangeRuntimeApi {
  /** Submits a change for preparation; acceptance does not imply the candidate is ready. */
  prepare(input: SubmitEvolutionChange): Promise<EvolutionChange>
  /** Returns the identified change within the supplied identity. */
  get(input: EvolutionChangeIdentity & { changeId: string }): Promise<EvolutionChange>
  /** Returns scoped changes matching the supplied target or request filters. */
  list(input: EvolutionChangeIdentity & { targetId?: string; requestId?: string }): Promise<EvolutionChange[]>
  /** Binds the human decision to the supplied candidate hash and evaluation run. */
  decide(
    input: EvolutionChangeIdentity & {
      changeId: string
      candidateHash: string
      evaluationRunId: string
      decision: 'approved' | 'rejected'
      reason: string
    }
  ): Promise<EvolutionChange>
  /** Requests publication under the strategy's publication and effect policy. */
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
  /** Actual effect or adoption, independent of whether publication is complete. */
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
