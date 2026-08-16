import type { EvolutionTargetProvider } from '@xpert-ai/contracts'
import { EvolutionTargetProviderStrategy } from '@xpert-ai/plugin-sdk'
import { Injectable } from '@nestjs/common'
import { ConformanceFieldMappingProvider } from './conformance-field-mapping.provider'

export const CONFORMANCE_INTENT_ROUTING_TARGET = 'conformance.intent_routing'

@Injectable()
@EvolutionTargetProviderStrategy(CONFORMANCE_INTENT_ROUTING_TARGET)
export class ConformanceIntentRoutingProvider
    extends ConformanceFieldMappingProvider
    implements EvolutionTargetProvider
{
    override readonly descriptor = {
        targetId: CONFORMANCE_INTENT_ROUTING_TARGET,
        targetType: 'test_fixture' as const,
        displayName: 'Conformance Intent Routing',
        providerKey: CONFORMANCE_INTENT_ROUTING_TARGET,
        providerVersion: '1.0.0',
        artifactSchemaVersion: '1',
        supportedScopes: ['organization' as const],
        riskLevel: 'R1' as const,
        metricSetId: 'conformance.routing.accuracy.v1',
        candidateForm: {
            description: 'Conformance-only fixture Change Set.',
            fields: [
                {
                    key: 'aliases',
                    label: 'Intent aliases',
                    type: 'string_array' as const,
                    required: true,
                    defaultValue: ['route-order', 'route-refund']
                }
            ]
        },
        capabilities: {
            candidateBuild: true,
            replay: true,
            shadow: true,
            canary: true,
            install: true,
            rollback: true
        },
        status: 'active' as const
    }
}
