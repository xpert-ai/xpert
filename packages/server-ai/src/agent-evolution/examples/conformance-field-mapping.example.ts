import type { EvolutionExampleDescriptor, GoldenCaseRevision } from '@xpert-ai/contracts'

interface ConformanceLearningSignal {
    sourceField: string
    value: string
    confidence: number
}

interface ConformanceGoldenCase {
    sourceField: string
    value: string
    slice: string
    risk: GoldenCaseRevision['risk']
}

export const CONFORMANCE_FIELD_MAPPING_EXAMPLE: EvolutionExampleDescriptor & {
    canonicalField: string
    baselineAliases: readonly string[]
    candidateAliases: readonly string[]
    learningSignals: readonly ConformanceLearningSignal[]
    goldenCases: readonly ConformanceGoldenCase[]
    rollout: {
        shadow: { sampleCount: number; canaryPercent: number; observationCount: number }
        canary: { sampleCount: number; canaryPercent: number; observationCount: number }
    }
} = {
    key: 'localized-invoice-field-mapping',
    name: 'Localized invoice amount field mapping',
    description:
        'Replay reviewed invoice fields, promote a deterministic alias candidate, and activate it through governed Shadow and Canary stages.',
    dataClassification: 'synthetic_test_fixture',
    canonicalField: 'amount',
    baselineAliases: ['amount', 'total'],
    candidateAliases: ['amount', 'total', '金额', '总额', '应付金额', '含税金额'],
    learningSignals: [
        { sourceField: '金额', value: '1234.56', confidence: 0.32 },
        { sourceField: '总额', value: '998.00', confidence: 0.34 },
        { sourceField: '应付金额', value: '2600.00', confidence: 0.36 },
        { sourceField: '含税金额', value: '345.60', confidence: 0.38 }
    ],
    goldenCases: [
        { sourceField: 'amount', value: '100.00', slice: 'core', risk: 'low' },
        { sourceField: 'total', value: '200.00', slice: 'core', risk: 'low' },
        { sourceField: '金额', value: '1234.56', slice: 'localized', risk: 'low' },
        { sourceField: '总额', value: '998.00', slice: 'localized', risk: 'low' },
        { sourceField: '应付金额', value: '2600.00', slice: 'blocking', risk: 'high' },
        { sourceField: '含税金额', value: '345.60', slice: 'localized', risk: 'low' }
    ],
    rollout: {
        shadow: { sampleCount: 100, canaryPercent: 100, observationCount: 5 },
        canary: { sampleCount: 240, canaryPercent: 10, observationCount: 5 }
    }
}
