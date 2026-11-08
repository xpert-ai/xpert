import { EvolutionScope } from './target'

/** Kind of observed evidence, independent of its trust or review status. */
export type LearningEventType = 'prediction_reviewed' | 'execution_failed' | 'business_outcome'

/** Ordinal trust tier of the evidence source, distinct from numeric confidence in the observation. */
export type LearningEventConfidence = 'L1' | 'L2' | 'L3' | 'L4'

/** Evidence about a target decision, tied to the version bundle under which the decision was made. */
export interface LearningEventInput {
  eventId?: string
  eventType: LearningEventType
  schemaVersion: string
  /** Stable identity of the logical event across repeated submissions. */
  idempotencyKey: string
  eventTime: string
  scope: EvolutionScope
  executionId?: string
  threadId?: string
  traceId?: string
  targetId: string
  decisionPoint: string
  /** Subject the decision concerns; multiple events may refer to the same subject. */
  subjectRef: string
  /** Identifies equivalent decision inputs without requiring their raw contents. */
  inputFingerprint: string
  predictionSummary: string
  finalOutcomeSummary: string
  confidence: number
  reasonCodes: string[]
  capabilityVersionBundleId: string
  /** Content hash of the cited capability bundle, not of the target artifact. */
  bundleHash: string
  trustLevel: LearningEventConfidence
  classification: 'public' | 'internal' | 'confidential'
  /** Confidential evidence must be redacted before ingestion. */
  redactionStatus: 'not_required' | 'redacted'
}

/** Recorded evidence and its review disposition. Inclusion as evidence does not itself authorize a change. */
export interface LearningEvent extends LearningEventInput {
  eventId: string
  createdAt: string
  reviewStatus?: 'pending' | 'ignored' | 'golden'
}

/** Proposed explanation for a set of related observations, retaining the underlying event identities. */
export interface EvolutionDiagnosis {
  diagnosisId: string
  targetId: string
  scope: EvolutionScope
  eventIds: string[]
  rootCause: string
  correctionSignature: string
  confidence: number
  createdAt: string
}

/** Evidence grouped by a shared correction signature for one target and scope. */
export interface EvolutionEventCluster {
  clusterId: string
  targetId: string
  scope: EvolutionScope
  correctionSignature: string
  eventIds: string[]
  /** Number of distinct subjects represented, which can be smaller than the event count. */
  caseCount: number
  status: 'collecting' | 'proposal_ready' | 'closed'
  createdAt: string
  updatedAt: string
}

/** Revisioned hypothesis that binds a change to its supporting events and the version it aims to improve. */
export interface ImprovementProposal {
  sourceKind: import('./strategy').EvolutionInputKind
  strategy: import('./strategy').EvolutionStrategySnapshot
  proposalId: string
  revision: number
  targetId: string
  scope: EvolutionScope
  title: string
  problemStatement: string
  rootCause: string
  changeHypothesis: string
  evidenceEventIds: string[]
  baseVersionId: string
  riskLevel: 'R1' | 'R2' | 'R3' | 'R4'
  status: 'draft' | 'ready' | 'candidate_built' | 'rejected'
  createdAt: string
  createdBy: string
}
