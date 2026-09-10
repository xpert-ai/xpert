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

/** Evidence requests share Proposal persistence without fabricating trusted learning events. */
export interface EvidenceEvolutionProposal extends Pick<
  ImprovementProposal,
  'problemStatement' | 'rootCause' | 'changeHypothesis' | 'riskLevel' | 'evidenceEventIds' | 'baseVersionId'
> {
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
export type StoredEvolutionProposal = ImprovementProposal | EvidenceEvolutionProposal

export interface PreparedEvolutionCandidate extends EvolutionCandidate {
  definition: Omit<EvolutionChangeCandidate, 'artifact'>
  evaluationRunId?: string
}

/** Replay bundles remain required by Replay EvaluationRun, not by every evaluator. */
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
export type ProviderReleasePackage = ProviderReleaseBase &
  (
    | { status: 'approved' | 'publishing'; receipt?: never }
    | { status: 'published'; receipt: EvolutionPublicationReceipt }
  )
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
