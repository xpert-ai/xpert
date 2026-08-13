import type {
  ActiveCapabilityPointer,
  ApprovalDecision,
  CapabilityVersion,
  CapabilityVersionBundle,
  DatasetSnapshot,
  EvaluationRun,
  EvolutionAuditEvent,
  EvolutionCandidate,
  EvolutionTargetDescriptor,
  ImprovementProposal,
  LearningEvent,
  ReleaseDeployment,
  ReleasePackage
} from '@xpert-ai/contracts'

export interface AgentEvolutionDashboard {
  targets: EvolutionTargetDescriptor[]
  versions: CapabilityVersion[]
  bundles: CapabilityVersionBundle[]
  events: LearningEvent[]
  proposals: ImprovementProposal[]
  candidates: EvolutionCandidate[]
  datasets: DatasetSnapshot[]
  evaluations: EvaluationRun[]
  approvals: ApprovalDecision[]
  releases: ReleasePackage[]
  deployments: ReleaseDeployment[]
  pointers: ActiveCapabilityPointer[]
  audits: EvolutionAuditEvent[]
}

export type { EvolutionSimulationResult } from '@xpert-ai/contracts'

export const EMPTY_EVOLUTION_DASHBOARD: AgentEvolutionDashboard = {
  targets: [],
  versions: [],
  bundles: [],
  events: [],
  proposals: [],
  candidates: [],
  datasets: [],
  evaluations: [],
  approvals: [],
  releases: [],
  deployments: [],
  pointers: [],
  audits: []
}

export type EvolutionViewStatus = 'success' | 'warning' | 'neutral' | 'danger'

export function shortId(value?: string | null, length = 10) {
  if (!value) {
    return '—'
  }
  return value.length > length ? `${value.slice(0, length)}…` : value
}

export function percent(value?: number | null, digits = 1) {
  return `${((value ?? 0) * 100).toFixed(digits)}%`
}
