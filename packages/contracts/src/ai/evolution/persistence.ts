import type { EvolutionCandidate } from './candidate'
import type { EvaluationRun } from './evaluation'
import type { ImprovementProposal } from './learning-event'
import type { ReleasePackage } from './release'
import type { EvolutionScope } from './target'
import type {
  EvolutionChangeCandidate,
  EvolutionChangeEvaluation,
  EvolutionEvidenceRef,
  EvolutionPublicationReceipt,
  EvolutionVersionRef
} from './change'

/** Proposal with a pinned baseline and evidence references. Evidence references and learning-event IDs are distinct inputs. */
export interface EvidenceEvolutionProposal extends Pick<
  ImprovementProposal,
  'problemStatement' | 'rootCause' | 'changeHypothesis' | 'riskLevel' | 'evidenceEventIds' | 'baseVersionId'
> {
  executionContext?: import('./change').EvolutionExecutionContext
  executionConversation?: import('./change').EvolutionExecutionConversation
  sourceKind: import('./strategy').EvolutionInputKind
  strategy: import('./strategy').EvolutionStrategySnapshot
  stages: import('./strategy').EvolutionStageRecord[]
  learningEventIds: string[]
  candidateInput: Record<string, string | number | boolean | string[]>
  datasetSnapshotIds: Record<string, string>
  proposalId: string
  revision: number
  targetId: string
  scope: EvolutionScope
  requestId: string
  candidateId: string
  title: string
  baseline: EvolutionVersionRef
  evidence: EvolutionEvidenceRef[]
  evidenceHash: string
  status: 'draft' | 'ready' | 'candidate_built' | 'rejected'
  preparation: 'queued' | 'completed' | 'failed'
  failureReasons: string[]
  jobId: string
  createdAt: string
  updatedAt: string
  createdBy: string
}
/** Persisted proposal in its learning or change-preparation shape; only the latter carries preparation state. */
export type StoredEvolutionProposal = ImprovementProposal | EvidenceEvolutionProposal

/** Candidate with reviewable baseline and delta information in addition to the immutable artifact. */
export interface PreparedEvolutionCandidate extends EvolutionCandidate {
  definition: Omit<EvolutionChangeCandidate, 'artifact'>
  evaluationRunId?: string
}

/** Strategy assessment carrying a change evaluation; its inputs need not include replay bundles. */
export interface ProviderEvaluationRun {
  evaluatorKind: 'strategy_checks'
  runId: string
  candidateId: string
  targetId: string
  scope: EvolutionScope
  status: 'passed' | 'failed'
  result: EvolutionChangeEvaluation
  startedAt: string
  completedAt: string
}
/** Evaluation record distinguished by evaluatorKind; only golden replay carries paired bundles and per-case outcomes. */
export type StoredEvaluationRun = EvaluationRun | ProviderEvaluationRun

interface ProviderReleaseBase {
  publicationKind: 'provider_version'
  releasePackageId: string
  candidateId: string
  candidateHash: string
  targetId: string
  evaluationRunId: string
  scope: EvolutionScope
  approvalIds: string[]
  artifactHash: string
  providerKey: string
  providerVersion: string
  createdAt: string
  updatedAt: string
  createdBy: string
}
/** Target-owned version write. A published record must identify the resulting version in its receipt. */
export type ProviderReleasePackage = ProviderReleaseBase &
  (
    | { status: 'approved' | 'publishing'; receipt?: never }
    | { status: 'published'; receipt: EvolutionPublicationReceipt }
  )
/** Publication record distinguished by publicationKind: staged deployment or target-owned version write. */
export type StoredReleasePackage = ReleasePackage | ProviderReleasePackage

export function isEvidenceProposal(value: StoredEvolutionProposal): value is EvidenceEvolutionProposal {
  return 'strategy' in value && 'candidateId' in value && !!value.strategy && !!value.candidateId
}
export function isLearningProposal(value: StoredEvolutionProposal): value is ImprovementProposal {
  return value.sourceKind === 'learning_events'
}
export function isPreparedCandidate(value: EvolutionCandidate): value is PreparedEvolutionCandidate {
  return !!value.strategy && value.definition !== undefined
}
export function isProviderEvaluation(value: StoredEvaluationRun): value is ProviderEvaluationRun {
  return value.evaluatorKind === 'strategy_checks'
}
export function isReplayEvaluation(value: StoredEvaluationRun): value is EvaluationRun {
  return value.evaluatorKind === 'golden_replay'
}
export function isProviderRelease(value: StoredReleasePackage): value is ProviderReleasePackage {
  return value.publicationKind === 'provider_version'
}
export function isStagedRelease(value: StoredReleasePackage): value is ReleasePackage {
  return value.publicationKind === 'staged_rollout'
}
