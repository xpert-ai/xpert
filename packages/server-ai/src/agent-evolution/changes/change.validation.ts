import type {
    EvolutionChange,
    EvolutionChangeEvaluation,
    EvolutionEvaluationStep,
    EvolutionStrategy,
    SubmitEvolutionChange
} from '@xpert-ai/contracts'
import { changeError } from './change.errors'

export function validateChangeInput(input: SubmitEvolutionChange, strategy: EvolutionStrategy) {
    if (
        !input ||
        !input.tenantId ||
        !input.organizationId ||
        !input.requestId ||
        input.requestId.length > 200 ||
        !input.targetId ||
        !input.scope?.key ||
        !input.baseline?.hash ||
        !input.baseline.resourceId ||
        !input.baseline.version
    )
        changeError('invalid_scope_or_baseline')
    if (input.scope.type === 'organization' && input.scope.key !== input.organizationId)
        changeError('identity_mismatch')
    if (input.scope.type === 'tenant' && input.scope.key !== input.tenantId) changeError('identity_mismatch')
    if (!strategy.inputs.includes(input.sourceKind)) changeError('strategy_not_allowed')
    if (
        !Array.isArray(input.evidence) ||
        input.evidence.length > 100 ||
        (!input.evidence.length && input.sourceKind !== 'manual')
    )
        changeError('evidence_required')
    for (const evidence of input.evidence) {
        if (
            !strategy.evidenceKinds.includes(evidence.kind) ||
            !evidence.subjectKey ||
            !evidence.uri ||
            !evidence.version ||
            !evidence.hash
        )
            changeError('invalid_evidence_reference')
    }
}
export function validateChangeEvaluation(
    change: EvolutionChange,
    evaluation: EvolutionChangeEvaluation,
    requiredChecks: EvolutionEvaluationStep['requiredChecks']
) {
    if (
        !change.candidate ||
        evaluation.candidateHash !== change.candidate.artifact.hash ||
        evaluation.baselineHash !== change.baseline.hash ||
        evaluation.evidenceHash !== change.evidenceHash ||
        !evaluation.datasetVersion ||
        !evaluation.datasetHash ||
        !evaluation.runId ||
        !evaluation.checks.length
    )
        changeError('evaluation_snapshot_mismatch')
    if (evaluation.passed !== evaluation.checks.every((check) => !check.blocking || check.passed))
        changeError('inconsistent_evaluation_gate')
    if (new Set(evaluation.checks.map((check) => check.checkId)).size !== evaluation.checks.length)
        changeError('duplicate_check_id')
    for (const required of requiredChecks) {
        if (
            !evaluation.checks.some(
                (check) =>
                    check.kind === required.kind &&
                    (required.origin === undefined || check.origin === required.origin) &&
                    (required.blocking === undefined || check.blocking === required.blocking)
            )
        )
            changeError('target_test_coverage_incomplete')
    }
}
