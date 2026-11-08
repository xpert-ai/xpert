import type {
  ActiveCapabilityPointer,
  EvolutionChangeEvaluation,
  ReleaseDeployment,
  ReleasePackage
} from '@xpert-ai/contracts'
import { isServing } from './release-presentation'

export function releaseTrendPoints(stages: ReleaseDeployment[]) {
  return stages
    .flatMap((stage) =>
      stage.observations
        .filter((p) => p.sampleCount > 0)
        .map((p) => ({
          stage,
          point: p,
          // A telemetry baseline without a contributing pair is unknown. A measured 0% must remain visible.
          baseline:
            stage.dataSource === 'runtime_telemetry' && !(p.pairedBaselineSamples && p.pairedBaselineSamples > 0)
              ? null
              : p.baselineAccuracy
        }))
    )
    .sort(
      (a, b) =>
        a.point.observedAt.localeCompare(b.point.observedAt) ||
        a.stage.startedAt.localeCompare(b.stage.startedAt) ||
        a.point.sequence - b.point.sequence
    )
}

export function releaseDecisionVerified(
  release: ReleasePackage,
  ptr: ActiveCapabilityPointer | undefined,
  assessment: EvolutionChangeEvaluation | undefined,
  stages: ReleaseDeployment[]
) {
  const gated = stages.filter((s) => s.channel !== 'production')
  return (
    isServing(release, ptr) &&
    !!assessment?.passed &&
    assessment.runId === release.evaluationRunId &&
    assessment.candidateHash === release.candidateHash &&
    release.approvalIds.length > 0 &&
    gated.length > 0 &&
    gated.every((s) => !!s.completedAt && !s.severeErrors) &&
    stages.every((s) => s.severeErrors === 0)
  )
}
