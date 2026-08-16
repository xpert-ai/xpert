import type { ApprovalDecision, EvaluationMetrics, GoldenCaseRevision } from '@xpert-ai/contracts'
import { AgentEvolutionQualityGovernanceService } from './agent-evolution-quality-governance.service'

describe('AgentEvolutionQualityGovernanceService', () => {
    const service = new AgentEvolutionQualityGovernanceService()

    it('enforces dataset, affected slice, high-risk and regression gates', () => {
        const cases: GoldenCaseRevision[] = Array.from({ length: 50 }, (_, index) => ({
            caseId: `CASE-${String(index + 1).padStart(3, '0')}`,
            revision: 1,
            input: { sourceAttribute: `attribute-${index}` },
            expected: { featureKey: 'rated_power' },
            slice: index < 20 ? 'affected:automotive-motor' : 'control',
            risk: index < 10 ? 'high' : 'medium',
            evidenceRef: `evidence:${index}`
        }))
        const metrics: EvaluationMetrics = {
            baselineAccuracy: 0.8,
            candidateAccuracy: 0.9,
            accuracyDelta: 0.1,
            severeErrors: 0,
            p95LatencyMs: 20,
            averageCost: 0,
            totalCases: 50,
            passedCases: 45
        }

        expect(service.reviewGoldenReplay(cases, metrics)).toEqual({
            passed: true,
            decision: 'promote',
            blockingReasons: []
        })
        expect(service.reviewGoldenReplay(cases, { ...metrics, severeErrors: 1 }).blockingReasons).toContain(
            'severe_errors_present'
        )
        expect(service.requiredHumanApprovals('R3')).toBe(3)

        const underscoreSlices = cases.map((item, index) => ({
            ...item,
            slice: index < 20 ? 'affected_alias' : 'control'
        }))
        expect(service.reviewGoldenReplay(underscoreSlices, metrics).passed).toBe(true)
    })

    it('allows one administrator approval while preserving the distinct person and role gate for other users', () => {
        const standardApproval = approval({ actorId: 'user-1', actorRole: 'role-1' })

        expect(service.reviewHumanApprovals('R2', [standardApproval])).toMatchObject({
            passed: false,
            requiredApprovals: 2,
            hasAdministratorApproval: false
        })
        expect(
            service.reviewHumanApprovals('R2', [standardApproval, approval({ actorId: 'user-2', actorRole: 'role-2' })])
        ).toMatchObject({ passed: true, requiredApprovals: 2 })
        expect(
            service.reviewHumanApprovals('R4', [
                approval({
                    actorId: 'admin-1',
                    actorRole: 'admin-role',
                    actorRoleName: 'ADMIN',
                    approvalAuthority: 'administrator'
                })
            ])
        ).toMatchObject({ passed: true, requiredApprovals: 1, hasAdministratorApproval: true })
    })
})

function approval(overrides: Partial<ApprovalDecision>): ApprovalDecision {
    return {
        approvalId: `APR-${overrides.actorId ?? 'user'}`,
        candidateId: 'CAND-001',
        candidateHash: 'sha256:candidate',
        evaluationRunId: 'ER-001',
        scope: { type: 'organization', key: 'ORG-001' },
        decision: 'approved',
        actorId: 'user-1',
        actorRole: 'role-1',
        reason: 'Approved for test',
        decidedAt: '2026-08-15T00:00:00.000Z',
        ...overrides
    }
}
