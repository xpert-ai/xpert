import type { I18nText } from '../../i18n.model'
import type { EvolutionEvidenceRef } from './change'
import type { EvolutionRiskLevel } from './target'

export type EvolutionInputKind = 'learning_events' | 'business_evidence' | 'manual'
export type EvolutionStageKey = 'learning' | 'candidate' | 'evaluation' | 'approval' | 'publication' | 'effect'
export type EvolutionStageStatus = 'pending' | 'running' | 'passed' | 'failed' | 'not_applicable'

export interface EvolutionEvaluationStep {
  key: string
  kind: 'target_checks' | 'golden_replay'
  requiredChecks: Array<{ kind: string; origin?: string; blocking?: boolean }>
}

/** Strategies compose stage capabilities; input origin never determines publication. */
export interface EvolutionStrategy {
  id: string
  version: string
  label: I18nText
  inputs: EvolutionInputKind[]
  learning:
    | { mode: 'none' }
    | {
        mode: 'feedback'
        minimumEvents: number
        minimumSubjects: number
        maximumAgeDays: number
        trustLevels: Array<'L2' | 'L3' | 'L4'>
      }
  evidenceKinds: EvolutionEvidenceRef['kind'][]
  candidate: { builder: 'change_set' | 'target_draft' }
  evaluations: EvolutionEvaluationStep[]
  approval: 'human'
  publication: { mode: 'staged_rollout' | 'version_write'; effect: 'activation' | 'explicit_adoption' }
}

export interface EvolutionStrategySnapshot {
  definition: EvolutionStrategy
  riskLevel: EvolutionRiskLevel
  hash: string
  providerKey: string
  providerVersion: string
}

export interface EvolutionStageRecord {
  key: EvolutionStageKey
  status: EvolutionStageStatus
  reason?: string
  runIds?: string[]
}

export const FEEDBACK_LEARNING_STRATEGY: EvolutionStrategy = {
  id: 'feedback_learning',
  version: '1',
  label: { en_US: 'Feedback learning', zh_Hans: '\u53cd\u9988\u5b66\u4e60\u8fdb\u5316' },
  inputs: ['learning_events'],
  learning: {
    mode: 'feedback',
    minimumEvents: 3,
    minimumSubjects: 2,
    maximumAgeDays: 90,
    trustLevels: ['L2', 'L3', 'L4']
  },
  evidenceKinds: ['execution'],
  candidate: { builder: 'change_set' },
  evaluations: [{ key: 'golden_replay', kind: 'golden_replay', requiredChecks: [] }],
  approval: 'human',
  publication: { mode: 'staged_rollout', effect: 'activation' }
}

export function evidenceDrivenStrategy(input: {
  version: string
  evidenceKinds: EvolutionEvidenceRef['kind'][]
  requiredChecks: EvolutionEvaluationStep['requiredChecks']
  effect?: EvolutionStrategy['publication']['effect']
}): EvolutionStrategy {
  return {
    id: 'evidence_driven',
    version: input.version,
    label: { en_US: 'Evidence-driven evolution', zh_Hans: '\u8bc1\u636e\u9a71\u52a8\u8fdb\u5316' },
    inputs: ['business_evidence'],
    learning: { mode: 'none' },
    evidenceKinds: input.evidenceKinds,
    candidate: { builder: 'target_draft' },
    evaluations: [{ key: 'domain_checks', kind: 'target_checks', requiredChecks: input.requiredChecks }],
    approval: 'human',
    publication: { mode: 'version_write', effect: input.effect ?? 'explicit_adoption' }
  }
}

export const HUMAN_PROPOSAL_STRATEGY: EvolutionStrategy = {
  id: 'human_proposal',
  version: '1',
  label: { en_US: 'Human proposal', zh_Hans: '\u4eba\u5de5\u63d0\u6848\u8fdb\u5316' },
  inputs: ['manual'],
  learning: { mode: 'none' },
  evidenceKinds: ['feedback', 'artifact'],
  candidate: { builder: 'target_draft' },
  evaluations: [],
  approval: 'human',
  publication: { mode: 'version_write', effect: 'activation' }
}
