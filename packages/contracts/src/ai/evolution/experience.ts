import type { EvolutionScope } from './target'

/** Scoped lesson supported by a released candidate's production outcomes and its evaluation. */
export interface EvolutionExperience {
  experienceId: string
  targetId: string
  scope: EvolutionScope
  sourceReleasePackageId: string
  sourceCandidateId: string
  /** Production observations and stability period supporting the lesson, alongside the originating evaluation. */
  evidence: {
    productionObservationCount: number
    severeErrors: number
    stableDays: number
    evaluationRunId: string
  }
  summary: string
  status: 'active' | 'expired'
  createdAt: string
  createdBy: string
}

/** Identifies the release whose observed production behavior is the basis of a lesson. */
export interface CreateEvolutionExperienceRequest {
  releasePackageId: string
}
