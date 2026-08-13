import type {
    ActiveCapabilityPointer,
    EvaluationRun,
    EvolutionAuditEvent,
    EvolutionCandidate,
    EvolutionTargetDescriptor,
    ImprovementProposal,
    LearningEvent,
    ReleaseDeployment,
    ReleasePackage
} from '@xpert-ai/contracts'
import type { EvolutionSimulationResult } from '../../../../../application'

export type EvolutionDashboard = {
    targets: EvolutionTargetDescriptor[]
    events: LearningEvent[]
    proposals: ImprovementProposal[]
    candidates: EvolutionCandidate[]
    evaluations: EvaluationRun[]
    releases: ReleasePackage[]
    deployments: ReleaseDeployment[]
    pointers: ActiveCapabilityPointer[]
    audits: EvolutionAuditEvent[]
}

export type EvolutionViewData = {
    items?: EvolutionTargetDescriptor[]
    total?: number
    summary?: EvolutionDashboard
}

export type SimulationActionResult = {
    success?: boolean
    message?: string | { en_US?: string; zh_Hans?: string }
    data?: EvolutionSimulationResult
}

export type EvolutionTab = 'overview' | 'learning' | 'evaluation' | 'release'
