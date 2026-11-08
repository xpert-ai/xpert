import type { EvolutionStrategy, EvolutionRiskLevel, LearningEvent, CapabilityVersion } from '@xpert-ai/contracts'
import { hashEvolutionValue } from '../domain/evolution-hash'

/** Membership is a set; historical cluster insertion order must never affect a checked proposal. */
export function learningCheckFingerprint(
    seedId: string,
    events: LearningEvent[],
    strategy: EvolutionStrategy,
    risk: EvolutionRiskLevel,
    baseline: CapabilityVersion
) {
    const ordered = [...events].sort((a, b) => a.eventId.localeCompare(b.eventId))
    return hashEvolutionValue(
        JSON.stringify([seedId, ordered, strategy, risk, baseline.versionId, baseline.artifact.hash])
    )
}
