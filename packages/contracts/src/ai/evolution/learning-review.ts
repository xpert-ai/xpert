import type { EvolutionPage, EvolutionPageQuery } from './governance'
import type { ImprovementProposal, LearningEvent } from './learning-event'
import type { EvolutionStrategy } from './strategy'

/** Filters within the current tenant and organization. Citation filters refer to direct evidence membership. */
export interface EvolutionLearningQuery extends EvolutionPageQuery {
  /** Includes provider test fixtures in the visible result set. */
  includeFixtures?: boolean
  /** Matches feedback explicitly classified as a correction by the target provider. */
  corrected?: boolean
  /** Matches feedback that belongs to a recorded diagnosis cluster. */
  grouped?: boolean
  /** Exact feedback identity, or the evidence cited by the returned suggestions. */
  eventId?: string
  /** Exact proposal identity, or the source of the returned evidence. */
  proposalId?: string
  /** Restricts a proposal reference to its immutable revision. */
  revision?: number
}

/** Scope count precedes local filters; total is the number of filtered records across all pages. */
export interface EvolutionLearningPage<T> extends EvolutionPage<T> {
  scopeTotal: number
}

/** A feedback event and the number of proposal revisions citing it as evidence. */
export interface LearningReviewRow {
  event: LearningEvent
  proposalCount: number
}

/** Proposal revision and the isolated candidate actually built from it, if any. */
export interface LearningProposalRow {
  proposal: ImprovementProposal
  candidateId?: string
}

/** Confirms one reviewed evidence snapshot and supplies the text to store with the new suggestion. */
export interface ConfirmLearningProposalRequest {
  /** Fingerprint of the eligible evidence and baseline reviewed by the caller. */
  snapshot: string
  title: string
  /** Description of the observed decision and reviewed outcome. */
  problemStatement?: string
  /** Proposed behavior change that remains subject to candidate evaluation. */
  changeHypothesis: string
}

/** Current evidence and governance requirements for a seed event under its target's feedback strategy. */
export interface LearningProposalCheck {
  /** Immutable eligibility requirements, absent when the target has no supported feedback strategy. */
  policy: Extract<EvolutionStrategy['learning'], { mode: 'feedback' }> | null
  /** Distinct eligible events sharing the seed's target, scope and correction signature. */
  eventIds: string[]
  /** Number of distinct evidence subjects, independent of event count. */
  subjects: number
  /** Eligible events whose payload is marked as redacted. */
  redacted: number
  /** Whether the seed itself is eligible to initiate a proposal. */
  seedEligible: boolean
  /** Production baseline to which this review applies. */
  baseVersionId: string | null
  /** Fingerprint of the checked evidence, strategy and baseline; present only when creation is permitted. */
  snapshot: string | null
}
