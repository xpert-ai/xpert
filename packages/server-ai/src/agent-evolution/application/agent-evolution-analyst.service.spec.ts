import type { LearningEvent } from '@xpert-ai/contracts'
import { AgentEvolutionAnalystService } from './agent-evolution-analyst.service'

describe('AgentEvolutionAnalystService', () => {
    it('groups redacted repeated corrections into a proposal-ready cluster', async () => {
        const events = [1, 2, 3].map(
            (index): LearningEvent => ({
                eventId: `EVT-${index}`,
                eventType: 'prediction_reviewed',
                schemaVersion: '1.0.0',
                idempotencyKey: `event-${index}`,
                eventTime: new Date().toISOString(),
                scope: { type: 'organization', key: 'org-automotive' },
                executionId: `execution-${index}`,
                targetId: 'bom.feature_binding',
                decisionPoint: 'requirement_feature_binding_review',
                subjectRef: index === 1 ? 'bom-case:CASE-001:requirement:1' : 'bom-case:CASE-002:requirement:2',
                inputFingerprint: `fingerprint-${index}`,
                predictionSummary: 'unmapped automotive motor field',
                finalOutcomeSummary: 'mapped to rated_power',
                confidence: 0.9,
                reasonCodes: ['wrong_feature'],
                capabilityVersionBundleId: 'BND-1',
                bundleHash: 'bundle-hash',
                trustLevel: 'L3',
                classification: 'confidential',
                redactionStatus: 'redacted',
                createdAt: new Date().toISOString()
            })
        )
        const store = {
            findLearningEvents: jest.fn().mockResolvedValue(events.map((value) => ({ value }))),
            saveDiagnosis: jest.fn().mockImplementation(async (_tenant, value) => ({ value })),
            saveEventCluster: jest.fn().mockImplementation(async (_tenant, value) => ({ value }))
        }
        const service = new AgentEvolutionAnalystService(store as never)

        const result = await service.diagnose(
            { tenantId: 'tenant-automotive', organizationId: 'org-automotive' },
            { eventIds: events.map((event) => event.eventId) }
        )

        expect(result.clusters).toHaveLength(1)
        expect(result.clusters[0]).toMatchObject({ caseCount: 2, status: 'proposal_ready' })
        expect(result.diagnoses[0]?.rootCause).toBe('repeated_correction_signature:wrong_feature')
    })
})
