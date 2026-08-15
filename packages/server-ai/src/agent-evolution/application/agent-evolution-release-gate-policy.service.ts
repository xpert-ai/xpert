import type { EvolutionReleaseGatePolicy, ReleasePackage } from '@xpert-ai/contracts'
import { environment } from '@xpert-ai/server-config'
import { Injectable } from '@nestjs/common'

const STANDARD_GATE_POLICY: EvolutionReleaseGatePolicy = {
    profile: 'standard',
    shadowMinimumSamples: 100,
    shadowMinimumDurationHours: 72,
    canaryMinimumSamples: 30,
    canaryMinimumDurationHours: 24,
    productionCanaryMinimumSamples: 30,
    productionCanaryMinimumDurationHours: 24,
    experienceMinimumSamples: 100,
    experienceMinimumDurationHours: 168
}

const MANUAL_TEST_DEFAULTS: EvolutionReleaseGatePolicy = {
    profile: 'manual_test',
    shadowMinimumSamples: 1,
    shadowMinimumDurationHours: 0,
    canaryMinimumSamples: 1,
    canaryMinimumDurationHours: 0,
    productionCanaryMinimumSamples: 1,
    productionCanaryMinimumDurationHours: 0,
    experienceMinimumSamples: 1,
    experienceMinimumDurationHours: 0
}

interface EvolutionReleaseGatePolicyEnvironment {
    production: boolean
    values: Readonly<Record<string, string | undefined>>
}

@Injectable()
export class AgentEvolutionReleaseGatePolicyService {
    snapshot(requestedShadowMinimumSamples?: number): EvolutionReleaseGatePolicy {
        return resolveEvolutionReleaseGatePolicy(
            {
                production: environment.production || process.env.NODE_ENV === 'production',
                values: process.env
            },
            requestedShadowMinimumSamples
        )
    }

    forRelease(release: ReleasePackage): EvolutionReleaseGatePolicy {
        if (release.gatePolicy) return release.gatePolicy
        return this.snapshot(release.shadowMinimumSamples)
    }

    manualTestProfileEnabled() {
        return this.snapshot().profile === 'manual_test'
    }
}

export function resolveEvolutionReleaseGatePolicy(
    source: EvolutionReleaseGatePolicyEnvironment,
    requestedShadowMinimumSamples?: number
): EvolutionReleaseGatePolicy {
    const manualTestRequested = source.values.AGENT_EVOLUTION_GATE_PROFILE?.trim().toLowerCase() === 'manual_test'
    if (!source.production && manualTestRequested) {
        return {
            profile: 'manual_test',
            shadowMinimumSamples: positiveInteger(
                source.values.AGENT_EVOLUTION_TEST_SHADOW_MIN_SAMPLES,
                MANUAL_TEST_DEFAULTS.shadowMinimumSamples
            ),
            shadowMinimumDurationHours: nonNegativeNumber(
                source.values.AGENT_EVOLUTION_TEST_SHADOW_MIN_HOURS,
                MANUAL_TEST_DEFAULTS.shadowMinimumDurationHours
            ),
            canaryMinimumSamples: positiveInteger(
                source.values.AGENT_EVOLUTION_TEST_CANARY_MIN_SAMPLES,
                MANUAL_TEST_DEFAULTS.canaryMinimumSamples
            ),
            canaryMinimumDurationHours: nonNegativeNumber(
                source.values.AGENT_EVOLUTION_TEST_CANARY_MIN_HOURS,
                MANUAL_TEST_DEFAULTS.canaryMinimumDurationHours
            ),
            productionCanaryMinimumSamples: positiveInteger(
                source.values.AGENT_EVOLUTION_TEST_PRODUCTION_MIN_SAMPLES,
                MANUAL_TEST_DEFAULTS.productionCanaryMinimumSamples
            ),
            productionCanaryMinimumDurationHours: nonNegativeNumber(
                source.values.AGENT_EVOLUTION_TEST_PRODUCTION_MIN_HOURS,
                MANUAL_TEST_DEFAULTS.productionCanaryMinimumDurationHours
            ),
            experienceMinimumSamples: positiveInteger(
                source.values.AGENT_EVOLUTION_TEST_EXPERIENCE_MIN_SAMPLES,
                MANUAL_TEST_DEFAULTS.experienceMinimumSamples
            ),
            experienceMinimumDurationHours: nonNegativeNumber(
                source.values.AGENT_EVOLUTION_TEST_EXPERIENCE_MIN_HOURS,
                MANUAL_TEST_DEFAULTS.experienceMinimumDurationHours
            )
        }
    }

    return {
        ...STANDARD_GATE_POLICY,
        shadowMinimumSamples: Math.max(
            STANDARD_GATE_POLICY.shadowMinimumSamples,
            nonNegativeInteger(requestedShadowMinimumSamples, STANDARD_GATE_POLICY.shadowMinimumSamples)
        )
    }
}

function nonNegativeInteger(value: string | number | undefined, fallback: number) {
    const parsed = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : fallback
}

function positiveInteger(value: string | undefined, fallback: number) {
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed >= 1 ? Math.trunc(parsed) : fallback
}

function nonNegativeNumber(value: string | undefined, fallback: number) {
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}
