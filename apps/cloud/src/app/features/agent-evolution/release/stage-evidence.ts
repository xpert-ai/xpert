import type {
  EvolutionCanaryTestOverride,
  EvolutionRuntimeObservation,
  ReleaseDeployment,
  ReleasePackage
} from '@xpert-ai/contracts'
import { sameEvolutionScope } from '../agent-evolution.types'

export type HitSource = 'natural' | 'specified' | 'unknown'

/** Count reviewed executions from this deployment. Unreadable or incomplete assignments cannot prove natural traffic. */
export function stageEvidence(
  stage: ReleaseDeployment,
  release: ReleasePackage,
  observations: EvolutionRuntimeObservation[],
  overrides: EvolutionCanaryTestOverride[] | null
) {
  const linked = stage.releasePackageId === release.releasePackageId && sameEvolutionScope(stage.scope, release.scope)
  const rows = linked
    ? observations
        .filter(
          (row) =>
            row.targetId === release.targetId &&
            row.deploymentId === stage.deploymentId &&
            row.channel === stage.channel &&
            sameEvolutionScope(row.scope, stage.scope)
        )
        .sort((a, b) => b.observedAt.localeCompare(a.observedAt))
    : []
  const complete =
    linked && rows.length === stage.sampleCount && new Set(rows.map((row) => row.observationId)).size === rows.length
  const consumed = overrides?.filter(
    (o) =>
      o.releasePackageId === stage.releasePackageId &&
      o.deploymentId === stage.deploymentId &&
      o.targetId === release.targetId &&
      o.candidateId === release.candidateId &&
      sameEvolutionScope(o.scope, stage.scope) &&
      o.status === 'consumed'
  )
  const assigned = new Set(consumed?.map((o) => o.consumedByExecutionId))
  const attributable =
    complete &&
    stage.dataSource === 'runtime_telemetry' &&
    stage.channel === 'canary' &&
    !!consumed &&
    consumed.every((o) => !!o.consumedByExecutionId)
  return {
    complete,
    attributable,
    rows: rows.map((row) => {
      const source: HitSource = !attributable ? 'unknown' : assigned.has(row.executionId) ? 'specified' : 'natural'
      return { row, source }
    })
  }
}
