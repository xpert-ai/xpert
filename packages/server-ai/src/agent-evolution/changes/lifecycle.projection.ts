import type { EvolutionChange, EvolutionLifecycleRecord, ReleasePackage } from '@xpert-ai/contracts'

export function lifecycleRecord(change: EvolutionChange, release?: ReleasePackage): EvolutionLifecycleRecord {
    const status = release?.status ?? change.status
    const published = release ? release.status === 'active' : change.status === 'published'
    const closed = ['rejected', 'rolled_back', 'superseded'].includes(status)
    const blocked = ['failed', 'stale', 'test_failed', 'paused'].includes(status)
    const publishing = !!release || ['approved', 'publishing'].includes(status)
    const publicationStatus = closed
        ? 'closed'
        : blocked
          ? 'blocked'
          : published
            ? 'published'
            : publishing
              ? 'publishing'
              : status === 'pending_approval'
                ? 'review'
                : 'preparing'
    const effectStatus = release
        ? release.status === 'active'
            ? 'active'
            : release.status === 'canary'
              ? 'partial'
              : 'pending'
        : (change.presentation?.effect?.status ??
          (published && change.strategy.definition.publication.effect === 'activation' ? 'active' : 'pending'))
    const phase = closed
        ? 'closed'
        : blocked
          ? 'blocked'
          : published && effectStatus === 'active'
            ? 'effective'
            : published || publishing
              ? 'publication'
              : status === 'pending_approval'
                ? 'review'
                : status === 'testing'
                  ? 'evaluation'
                  : 'preparation'
    const stages = change.stages.map((step) =>
        step.key === 'publication' && published
            ? { ...step, status: 'passed' as const }
            : step.key === 'effect'
              ? {
                    ...step,
                    status:
                        effectStatus === 'active'
                            ? ('passed' as const)
                            : effectStatus === 'partial'
                              ? ('running' as const)
                              : ('pending' as const)
                }
              : step
    )
    return {
        id: change.changeId,
        targetId: change.targetId,
        title: change.presentation?.title ?? change.candidate?.summary ?? change.targetId,
        scope: change.scope,
        phase,
        status,
        publicationStatus,
        effectStatus,
        strategy: change.strategy,
        sourceKind: change.sourceKind,
        stages,
        createdAt: change.createdAt,
        updatedAt: change.updatedAt,
        releasePackageId: release?.releasePackageId,
        baseline: change.baseline,
        candidate: change.candidate,
        evaluation: change.evaluation,
        approvals: change.approval ? [change.approval] : [],
        publication: release
            ? {
                  status: release.status,
                  version: {
                      resourceId: release.targetVersionId,
                      version: release.targetVersionId,
                      hash: release.artifactHash
                  }
              }
            : change.receipt
              ? {
                    status: 'published',
                    version: change.receipt.resource,
                    receipt: change.receipt,
                    publishedAt: change.receipt.completedAt
                }
              : undefined,
        presentation: change.presentation,
        presentationUnavailable: change.presentationUnavailable,
        capabilities: {
            stagedRollout: change.strategy.definition.publication.mode === 'staged_rollout',
            evaluate: !change.evaluation && ['preparing', 'testing', 'failed'].includes(change.status),
            decide: ['pending_approval', 'test_failed'].includes(change.status),
            publish: ['approved', 'publishing'].includes(change.status) && !release
        }
    }
}
