import type { EvolutionCandidateStatus, EvolutionReleaseStatus } from '@xpert-ai/contracts'
import { BadRequestException } from '@nestjs/common'

const CANDIDATE_TRANSITIONS: Record<EvolutionCandidateStatus, EvolutionCandidateStatus[]> = {
    building: ['ready'],
    ready: ['evaluating'],
    evaluating: ['evaluation_failed', 'pending_approval'],
    evaluation_failed: ['expired'],
    pending_approval: ['approved', 'rejected'],
    approved: ['packaged'],
    rejected: ['expired'],
    packaged: [],
    expired: []
}

const RELEASE_TRANSITIONS: Record<EvolutionReleaseStatus, EvolutionReleaseStatus[]> = {
    draft: ['pending_approval'],
    pending_approval: ['approved'],
    approved: ['installed'],
    installed: ['shadow'],
    shadow: ['canary', 'paused', 'rolled_back'],
    canary: ['active', 'paused', 'rolled_back'],
    active: ['superseded', 'rolled_back'],
    paused: ['shadow', 'canary', 'rolled_back'],
    rolled_back: [],
    superseded: []
}

export function assertCandidateTransition(from: EvolutionCandidateStatus, to: EvolutionCandidateStatus) {
    if (!CANDIDATE_TRANSITIONS[from].includes(to)) {
        throw new BadRequestException(`Illegal candidate transition: ${from} -> ${to}`)
    }
}

export function assertReleaseTransition(from: EvolutionReleaseStatus, to: EvolutionReleaseStatus) {
    if (!RELEASE_TRANSITIONS[from].includes(to)) {
        throw new BadRequestException(`Illegal release transition: ${from} -> ${to}`)
    }
}
