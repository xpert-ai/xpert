import type {
  EvolutionChange,
  EvolutionLifecycleRecord,
  EvolutionStageKey,
  EvolutionStageStatus
} from '@xpert-ai/contracts'

export interface ChangeDetailStep {
  key: EvolutionStageKey
  labelKey: string
  status: EvolutionStageStatus | 'paused' | 'closed' | 'unknown'
  blockedBy?: EvolutionStageKey
}

/** Presentation only: retain the canonical records and never use display text as a discriminator. */
export function changeDetailPresentation(change: EvolutionChange, record?: EvolutionLifecycleRecord | null) {
  const lifecycle = record?.id === change.changeId ? record : undefined
  const strategy = change.strategy.definition
  const business = change.presentation?.business
  const stagedRelease =
    strategy.publication.mode === 'staged_rollout' && lifecycle?.releasePackageId ? lifecycle : undefined
  const published = stagedRelease
    ? stagedRelease.publicationStatus === 'published'
    : Boolean(change.receipt || lifecycle?.publicationStatus === 'published' || change.status === 'published')
  const stages = lifecycle?.stages.length ? lifecycle.stages : change.stages
  const explicitAdoption = strategy.publication.effect === 'explicit_adoption'
  const effect = published ? (lifecycle?.effectStatus ?? change.presentation?.effect?.status) : 'pending'
  const adoption = business?.adoption
  const stageKeys: EvolutionStageKey[] = ['learning', 'candidate', 'evaluation', 'approval', 'publication', 'effect']
  const steps: ChangeDetailStep[] = stageKeys
    .filter((key) => key !== 'learning' || strategy.learning.mode !== 'none')
    .map((key) => {
      let status: ChangeDetailStep['status'] = stages.find((stage) => stage.key === key)?.status ?? 'pending'
      if (key === 'candidate' && change.candidate) status = 'passed'
      if (key === 'evaluation') {
        if (!strategy.evaluations.length || change.evaluation?.assessment === 'not_applicable')
          status = 'not_applicable'
        else if (change.evaluation) status = change.evaluation.passed ? 'passed' : 'failed'
      }
      if (key === 'approval' && change.approval) status = change.approval.decision === 'approved' ? 'passed' : 'failed'
      if (key === 'publication' && published) status = 'passed'
      else if (key === 'publication' && stagedRelease) {
        status =
          stagedRelease.publicationStatus === 'closed'
            ? 'closed'
            : stagedRelease.status === 'paused'
              ? 'paused'
              : stagedRelease.publicationStatus === 'blocked'
                ? 'failed'
                : 'running'
      }
      if (key === 'effect')
        status = !published
          ? 'pending'
          : adoption && explicitAdoption
            ? adoption.total > 0 && adoption.adopted >= adoption.total
              ? 'passed'
              : adoption.adopted > 0
                ? 'running'
                : 'pending'
            : effect === 'active'
              ? 'passed'
              : effect === 'partial'
                ? 'running'
                : effect === 'pending'
                  ? 'pending'
                  : 'unknown'
      const label =
        key === 'candidate' && strategy.candidate.builder === 'target_draft'
          ? 'DraftStep'
          : key === 'evaluation'
            ? 'CheckStep'
            : key === 'approval'
              ? 'ReviewStep'
              : key === 'publication' && strategy.publication.mode === 'version_write'
                ? 'PublishStep'
                : key === 'effect' && explicitAdoption
                  ? 'AdoptStep'
                  : undefined
      return {
        key,
        status,
        labelKey: label ? `XP.AgentEvolution.ChangeDetail.${label}` : `XP.AgentEvolution.StrategyStage.${key}`
      }
    })
  if (change.status === 'failed' && !steps.some((step) => step.status === 'failed')) {
    const failed = steps.find((step) => step.key === (change.candidate ? 'evaluation' : 'candidate'))
    if (failed) failed.status = 'failed'
  }
  let blockedBy: EvolutionStageKey | undefined
  for (const step of steps) {
    if (blockedBy && step.status !== 'passed' && step.status !== 'not_applicable') {
      step.status = 'pending'
      step.blockedBy = blockedBy
    }
    if (step.status === 'failed') blockedBy = step.key
  }
  const failedStage = steps.find((step) => step.status === 'failed')
  const failed = Boolean(failedStage || ['failed', 'test_failed', 'stale', 'rejected'].includes(change.status))
  const reasons = [
    ...new Set(
      [
        ...(change.failureReasons ?? []),
        ...(change.approval?.decision === 'rejected' && change.approval.reason ? [change.approval.reason] : []),
        ...stages.filter((step) => step.status === 'failed').flatMap((step) => (step.reason ? [step.reason] : [])),
        ...(change.status === 'test_failed'
          ? (change.evaluation?.checks
              .filter((check) => !check.passed && check.blocking)
              .map((check) => check.details || check.title) ?? [])
          : [])
      ]
        .map((reason) => reason.trim())
        .filter(Boolean)
    )
  ]
  const checkState = steps.find((step) => step.key === 'evaluation')?.status ?? 'pending'
  const result = stagedRelease
    ? 'StagedRelease'
    : change.status === 'stale'
      ? 'Stale'
      : change.status === 'rejected'
        ? 'Rejected'
        : failedStage?.key === 'candidate'
          ? 'DraftFailed'
          : failedStage?.key === 'evaluation' || change.status === 'test_failed'
            ? 'ChecksFailed'
            : failed
              ? 'Failed'
              : published
                ? explicitAdoption && steps.find((step) => step.key === 'effect')?.status !== 'unknown'
                  ? steps.find((step) => step.key === 'effect')?.status === 'passed'
                    ? 'Adopted'
                    : steps.find((step) => step.key === 'effect')?.status === 'running'
                      ? 'PartlyAdopted'
                      : 'AwaitingAdoption'
                  : 'Published'
                : change.status === 'publishing'
                  ? 'Publishing'
                  : change.status === 'approved'
                    ? 'AwaitingPublication'
                    : change.status === 'pending_approval'
                      ? checkState === 'not_applicable'
                        ? 'AwaitingHumanReview'
                        : 'AwaitingReview'
                      : checkState === 'running'
                        ? 'Checking'
                        : change.status === 'testing' || change.candidate
                          ? 'AwaitingChecks'
                          : steps.find((step) => step.key === 'candidate')?.status === 'running'
                            ? 'Drafting'
                            : 'AwaitingDraft'
  const guidanceKey = reasons.includes('candidate_baseline_mismatch')
    ? 'BaselineMismatchAdvice'
    : reasons.includes('invalid_candidate_artifact')
      ? 'InvalidDraftAdvice'
      : undefined
  return {
    business,
    published,
    explicitAdoption,
    steps,
    failed,
    reasons,
    result,
    stagedStatus: stagedRelease?.status,
    checkState,
    guidanceKey,
    checkBlockedBy: steps.find((step) => step.key === 'evaluation')?.blockedBy,
    action:
      published && explicitAdoption
        ? 'ViewAdoption'
        : failed
          ? 'OpenFailure'
          : change.status === 'pending_approval'
            ? 'ReviewInWorkbench'
            : 'OpenWorkbench'
  }
}
