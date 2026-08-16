import type { ApprovalDecision, EvaluationMetrics, EvolutionRiskLevel, GoldenCaseRevision } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'

@Injectable()
export class AgentEvolutionQualityGovernanceService {
    reviewGoldenReplay(cases: GoldenCaseRevision[], metrics: EvaluationMetrics) {
        const blockingReasons: string[] = []
        const affectedCount = cases.filter(
            (item) =>
                item.slice === 'affected' || item.slice.startsWith('affected:') || item.slice.startsWith('affected_')
        ).length
        const highRiskCount = cases.filter((item) => item.risk === 'high').length
        if (metrics.totalCases < 50) blockingReasons.push('golden_dataset_below_50_cases')
        if (affectedCount < 20) blockingReasons.push('affected_slice_below_20_cases')
        if (highRiskCount < 10) blockingReasons.push('high_risk_slice_below_10_cases')
        if (metrics.severeErrors > 0) blockingReasons.push('severe_errors_present')
        if (metrics.accuracyDelta <= 0) blockingReasons.push('candidate_does_not_improve_baseline')
        return {
            passed: blockingReasons.length === 0,
            decision: blockingReasons.length ? ('reject' as const) : ('promote' as const),
            blockingReasons
        }
    }

    requiredHumanApprovals(riskLevel: EvolutionRiskLevel) {
        return riskLevel === 'R3' || riskLevel === 'R4' ? 3 : 2
    }

    reviewHumanApprovals(riskLevel: EvolutionRiskLevel, approvals: ApprovalDecision[]) {
        const approved = approvals.filter((item) => item.decision === 'approved')
        const hasAdministratorApproval = approved.some((item) => item.approvalAuthority === 'administrator')
        const requiredApprovals = hasAdministratorApproval ? 1 : this.requiredHumanApprovals(riskLevel)
        const uniqueApprovers = new Set(approved.map((item) => item.actorId)).size
        const uniqueApproverRoles = new Set(approved.map((item) => item.actorRole)).size

        return {
            passed:
                hasAdministratorApproval ||
                (uniqueApprovers >= requiredApprovals && uniqueApproverRoles >= requiredApprovals),
            requiredApprovals,
            uniqueApprovers,
            uniqueApproverRoles,
            hasAdministratorApproval
        }
    }
}
