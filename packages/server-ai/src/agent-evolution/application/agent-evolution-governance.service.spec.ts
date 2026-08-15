import type { EvolutionReleaseGatePolicy, EvolutionScope, ReleaseDeployment, ReleasePackage } from '@xpert-ai/contracts'
import { EvolutionTargetProviderRegistry } from '@xpert-ai/plugin-sdk'
import { BadRequestException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { AgentEvolutionGovernanceService } from './agent-evolution-governance.service'
import { AgentEvolutionQualityGovernanceService } from './agent-evolution-quality-governance.service'
import { AgentEvolutionReleaseGatePolicyService } from './agent-evolution-release-gate-policy.service'
import { AgentEvolutionStore } from './agent-evolution.store'

describe('AgentEvolutionGovernanceService one-time Candidate override', () => {
    const scope: EvolutionScope = { type: 'organization', key: 'org-1' }
    const gatePolicy: EvolutionReleaseGatePolicy = {
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
        gatePolicy,
        shadowMinimumSamples: 1,
        canaryPercent: 5,
        createdAt: '2026-08-15T00:00:00.000Z',
        createdBy: 'admin-1'
    }
    const deployment: ReleaseDeployment = {
        deploymentId: 'DEP-1',
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

    async function createFixture() {
        const createCanaryTestOverride = jest.fn(async (...parameters) => parameters[1])
        const store = {
            findRelease: async () => ({ value: release }),
            listDeploymentsForRelease: async () => [{ ...deployment, value: deployment }],
            listCanaryTestOverrides: async () => [],
            createCanaryTestOverride
        }
        const moduleRef = await Test.createTestingModule({
            providers: [
                AgentEvolutionGovernanceService,
                { provide: AgentEvolutionStore, useValue: store },
                { provide: EvolutionTargetProviderRegistry, useValue: {} },
                { provide: AgentEvolutionQualityGovernanceService, useValue: {} },
                {
                    provide: AgentEvolutionReleaseGatePolicyService,
                    useValue: { manualTestProfileEnabled: () => true }
                }
            ]
        }).compile()
        return {
            service: moduleRef.get(AgentEvolutionGovernanceService),
            createCanaryTestOverride
        }
    }

    it('rejects non-administrators before creating an override', async () => {
        const { service, createCanaryTestOverride } = await createFixture()

        await expect(
            service.createCanaryTestOverride(
                {
                    tenantId: 'tenant-1',
                    organizationId: 'org-1',
                    actorId: 'user-1',
                    actorRole: 'role-1',
                    approvalAuthority: 'standard',
                    actorType: 'human'
                },
                release.releasePackageId,
                { subjectKey: 'CASE-001', reason: 'Verify one Candidate execution' }
            )
        ).rejects.toBeInstanceOf(BadRequestException)
        expect(createCanaryTestOverride).not.toHaveBeenCalled()
    })

    it('creates an expiring administrator-only override with an auditable reason', async () => {
        const { service, createCanaryTestOverride } = await createFixture()

        const result = await service.createCanaryTestOverride(
            {
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                actorId: 'admin-1',
                actorRole: 'role-admin',
                actorRoleName: 'ADMIN',
                approvalAuthority: 'administrator',
                actorType: 'human'
            },
            release.releasePackageId,
            { subjectKey: 'CASE-001', reason: 'Verify one Candidate execution', expiresInMinutes: 15 }
        )

        expect(result).toMatchObject({
            releasePackageId: release.releasePackageId,
            candidateId: release.candidateId,
            deploymentId: deployment.deploymentId,
            targetId: release.targetId,
            subjectKey: 'CASE-001',
            status: 'pending',
            reason: 'Verify one Candidate execution',
            createdBy: 'admin-1',
            createdByRole: 'ADMIN'
        })
        expect(createCanaryTestOverride).toHaveBeenCalledWith(
            { tenantId: 'tenant-1', organizationId: 'org-1' },
            expect.objectContaining({ subjectKey: 'CASE-001', status: 'pending' }),
            expect.objectContaining({
                action: 'canary.manual_test_override_created',
                actorId: 'admin-1',
                metadata: expect.objectContaining({
                    deploymentId: deployment.deploymentId,
                    subjectKey: 'CASE-001',
                    reason: 'Verify one Candidate execution',
                    overrideStatus: 'pending'
                })
            })
        )
    })
})
