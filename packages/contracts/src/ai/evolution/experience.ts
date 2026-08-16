import type { EvolutionScope } from './target'

export interface EvolutionExperience {
  experienceId: string
  targetId: string
  scope: EvolutionScope
  sourceReleasePackageId: string
  sourceCandidateId: string
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

export interface CreateEvolutionExperienceRequest {
  releasePackageId: string
}
