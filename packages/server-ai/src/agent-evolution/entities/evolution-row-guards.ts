import { isLearningProposal, isReplayEvaluation, isStagedRelease } from '@xpert-ai/contracts'
import { changeError } from '../changes/change.errors'
import type { EvaluationRunEntity, ImprovementProposalEntity, ReleasePackageEntity } from './evolution.entities'

export function learningProposalRow(row: ImprovementProposalEntity) {
    if (!isLearningProposal(row.value)) changeError('proposal_mechanism_mismatch')
    return { ...row, value: row.value }
}
export function replayEvaluationRow(row: EvaluationRunEntity) {
    if (!isReplayEvaluation(row.value)) changeError('evaluation_mechanism_mismatch')
    return { ...row, value: row.value }
}
export function stagedReleaseRow(row: ReleasePackageEntity) {
    if (!isStagedRelease(row.value)) changeError('publication_mechanism_mismatch')
    return { ...row, value: row.value, status: row.value.status }
}
