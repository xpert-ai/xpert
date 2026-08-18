import { resolveEvolutionReleaseGatePolicy } from './agent-evolution-release-gate-policy.service'

describe('AgentEvolution release gate policy', () => {
    it('keeps the standard governance floor by default', () => {
        expect(
            resolveEvolutionReleaseGatePolicy(
                {
                    production: false,
                    values: {}
                },
                12
            )
        ).toMatchObject({
            profile: 'standard',
            shadowMinimumSamples: 100,
            shadowMinimumDurationHours: 72,
            canaryMinimumSamples: 30,
            canaryMinimumDurationHours: 24,
            experienceMinimumSamples: 100,
            experienceMinimumDurationHours: 168
        })
    })

    it('uses configurable fast gates for a non-production manual test', () => {
        expect(
            resolveEvolutionReleaseGatePolicy({
                production: false,
                values: {
                    AGENT_EVOLUTION_GATE_PROFILE: 'manual_test',
                    AGENT_EVOLUTION_TEST_SHADOW_MIN_SAMPLES: '3',
                    AGENT_EVOLUTION_TEST_SHADOW_MIN_HOURS: '0.25',
                    AGENT_EVOLUTION_TEST_CANARY_MIN_SAMPLES: '2',
                    AGENT_EVOLUTION_TEST_CANARY_MIN_HOURS: '0',
                    AGENT_EVOLUTION_TEST_PRODUCTION_MIN_SAMPLES: '4',
                    AGENT_EVOLUTION_TEST_PRODUCTION_MIN_HOURS: '0.5',
                    AGENT_EVOLUTION_TEST_EXPERIENCE_MIN_SAMPLES: '5',
                    AGENT_EVOLUTION_TEST_EXPERIENCE_MIN_HOURS: '1'
                }
            })
        ).toEqual({
            profile: 'manual_test',
            shadowMinimumSamples: 3,
            shadowMinimumDurationHours: 0.25,
            canaryMinimumSamples: 2,
            canaryMinimumDurationHours: 0,
            productionCanaryMinimumSamples: 4,
            productionCanaryMinimumDurationHours: 0.5,
            experienceMinimumSamples: 5,
            experienceMinimumDurationHours: 1
        })
    })

    it('ignores the manual-test profile on a production server', () => {
        expect(
            resolveEvolutionReleaseGatePolicy({
                production: true,
                values: {
                    AGENT_EVOLUTION_GATE_PROFILE: 'manual_test',
                    AGENT_EVOLUTION_TEST_SHADOW_MIN_SAMPLES: '0',
                    AGENT_EVOLUTION_TEST_SHADOW_MIN_HOURS: '0'
                }
            })
        ).toMatchObject({
            profile: 'standard',
            shadowMinimumSamples: 100,
            shadowMinimumDurationHours: 72
        })
    })
})
