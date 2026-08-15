import type {
    CapabilityVersion,
    EvolutionCanaryTestOverride,
    EvolutionScope,
    ReleaseDeployment,
    ReleasePackage
} from '@xpert-ai/contracts'
import { Test } from '@nestjs/testing'
import { AgentEvolutionRuntimeService } from './agent-evolution-runtime.service'
import { AgentEvolutionStore } from './agent-evolution.store'

describe('AgentEvolutionRuntimeService one-time Candidate override', () => {
    it('forces exactly one marked Candidate assignment and then returns to deterministic Canary routing', async () => {
        const scope: EvolutionScope = { type: 'organization', key: 'org-1' }
        const deploymentId = 'DEP-RP-e282368e-ebd7-46e8-beac-f01d0fda5edd-canary-5-52f98b2f'
        const subjectKey = '4ded459d-7b0e-4071-8c0f-c4d2fe9c43ab'
        const release: ReleasePackage = {
            releasePackageId: 'RP-1',
            candidateId: 'CAND-1',
            candidateHash: 'candidate-hash',
            targetId: 'bom.feature_binding',
            targetVersionId: 'bom.feature_binding:v2',
            rollbackVersionId: 'bom.feature_binding:v1',
            evaluationRunId: 'ER-1',
            scope,
            status: 'canary',
            approvalIds: ['APR-1'],
            artifactHash: 'candidate-artifact-hash',
            providerKey: 'bom-lifecycle.feature-binding',
            providerVersion: '1.0.0',
            shadowMinimumSamples: 1,
            canaryPercent: 5,
            createdAt: '2026-08-15T00:00:00.000Z',
            createdBy: 'admin-1'
        }
        const deployment: ReleaseDeployment = {
            deploymentId,
            releasePackageId: release.releasePackageId,
            channel: 'canary',
            scope,
            status: 'canary',
            dataSource: 'runtime_telemetry',
            sampleCount: 0,
            candidateAccuracy: 0,
            severeErrors: 0,
            canaryPercent: 5,
            observations: [],
            startedAt: '2026-08-15T00:00:00.000Z'
        }
        const override: EvolutionCanaryTestOverride = {
            overrideId: 'CTO-1',
            releasePackageId: release.releasePackageId,
            candidateId: release.candidateId,
            deploymentId,
            targetId: release.targetId,
            scope,
            subjectKey,
            status: 'consumed',
            reason: 'Manual end-to-end Candidate verification',
            createdBy: 'admin-1',
            createdByRole: 'ADMIN',
            createdAt: '2026-08-15T00:00:00.000Z',
            expiresAt: '2026-08-15T00:30:00.000Z',
            consumedAt: '2026-08-15T00:01:00.000Z',
            consumedByExecutionId: 'EXEC-1'
        }
        const versions = new Map<string, CapabilityVersion>([
            ['bom.feature_binding:v1', capabilityVersion('bom.feature_binding:v1', 'baseline-hash')],
            ['bom.feature_binding:v2', capabilityVersion('bom.feature_binding:v2', 'candidate-hash')]
        ])
        let overridePending = true
        const consumeCanaryTestOverride = jest.fn().mockImplementation(async () => {
            if (!overridePending) return null
            overridePending = false
            return override
        })
        const store = {
            findPointer: async () => ({
                activeVersionId: 'bom.feature_binding:v1',
                value: { releasePackageId: 'RP-BASELINE' }
            }),
            listDeploymentsForTarget: async () => [{ value: deployment }],
            findRelease: async () => ({ value: release }),
            consumeCanaryTestOverride,
            findVersion: async (_tenant: object, versionId: string) => {
                const value = versions.get(versionId)
                return value ? { value } : null
            },
            saveBundle: async (_tenant: object, value: object) => ({ value }),
            listDeploymentsForRelease: async () => []
        }
        const moduleRef = await Test.createTestingModule({
            providers: [AgentEvolutionRuntimeService, { provide: AgentEvolutionStore, useValue: store }]
        }).compile()
        const service = moduleRef.get(AgentEvolutionRuntimeService)

        const forcedPlan = await service.resolveExecutionPlan({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            scope,
            targetIds: [release.targetId],
            subjectKey,
            executionId: 'EXEC-1'
        })
        const followingPlan = await service.resolveExecutionPlan({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            scope,
            targetIds: [release.targetId],
            subjectKey,
            executionId: 'EXEC-2'
        })

        expect(forcedPlan).toMatchObject({
            executionMode: 'canary',
            assignments: [
                {
                    targetId: release.targetId,
                    channel: 'canary',
                    versionId: release.targetVersionId,
                    selectionReason: 'manual_test_override',
                    manualTestOverrideId: override.overrideId
                }
            ],
            manualTestOverrides: [
                {
                    overrideId: override.overrideId,
                    releasePackageId: release.releasePackageId,
                    deploymentId,
                    targetId: release.targetId
                }
            ]
        })
        expect(followingPlan).toMatchObject({
            executionMode: 'production',
            assignments: [
                {
                    targetId: release.targetId,
                    channel: 'production',
                    versionId: release.rollbackVersionId
                }
            ]
        })
        expect(followingPlan.manualTestOverrides).toBeUndefined()
        expect(consumeCanaryTestOverride).toHaveBeenCalledTimes(2)
    })
})

function capabilityVersion(versionId: string, artifactHash: string): CapabilityVersion {
    return {
        versionId,
        targetId: 'bom.feature_binding',
        sequence: versionId.endsWith(':v2') ? 2 : 1,
        semanticVersion: versionId.endsWith(':v2') ? '2.0.0' : '1.0.0',
        artifact: {
            uri: `evolution://${versionId}`,
            hash: artifactHash,
            schemaVersion: '1.0.0',
            mediaType: 'application/json'
        },
        providerKey: 'bom-lifecycle.feature-binding',
        providerVersion: '1.0.0',
        dependencyVersionIds: [],
        createdAt: '2026-08-15T00:00:00.000Z',
        createdBy: 'admin-1'
    }
}
