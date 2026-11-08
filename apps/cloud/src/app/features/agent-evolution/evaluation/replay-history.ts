import type { EvaluationRun, EvolutionCandidate } from '@xpert-ai/contracts'
import { sameEvolutionScope } from '../agent-evolution.types'

/** Only use the structured result view when the candidate and the persisted replay evidence agree. */
export function supportsHistoricalResult(run: EvaluationRun, candidate?: EvolutionCandidate) {
  if (
    !candidate ||
    candidate.candidateId !== run.candidateId ||
    (run.targetId && candidate.targetId !== run.targetId) ||
    (run.scope && !sameEvolutionScope(run.scope, candidate.targetScope))
  )
    return false
  return (
    run.evaluatorKind === 'golden_replay' &&
    typeof run.datasetSnapshotId === 'string' &&
    Array.isArray(run.baselineBundle?.items) &&
    Array.isArray(run.candidateBundle?.items) &&
    [...run.baselineBundle.items, ...run.candidateBundle.items].every(
      (item) => item && typeof item.versionId === 'string'
    ) &&
    !!run.metrics &&
    [
      run.metrics.totalCases,
      run.metrics.passedCases,
      run.metrics.severeErrors,
      run.metrics.accuracyDelta,
      run.metrics.baselineAccuracy,
      run.metrics.candidateAccuracy
    ].every(Number.isFinite) &&
    typeof run.gate?.passed === 'boolean' &&
    Array.isArray(run.gate.blockingReasons) &&
    run.gate.blockingReasons.every((reason) => typeof reason === 'string') &&
    Array.isArray(run.caseResults) &&
    run.caseResults.every(
      (row) =>
        row &&
        typeof row.caseId === 'string' &&
        typeof row.baselinePassed === 'boolean' &&
        typeof row.candidatePassed === 'boolean' &&
        typeof row.severeError === 'boolean' &&
        !!row.baselineOutput &&
        !!row.candidateOutput &&
        !!row.expectedOutput
    )
  )
}
