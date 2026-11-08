import type {
  ActiveCapabilityPointer,
  EvolutionCanaryTestOverride,
  EvolutionRuntimeObservation,
  EvolutionTargetDescriptor,
  ReleaseDeployment,
  ReleasePackage
} from '@xpert-ai/contracts'
import { sameEvolutionScope } from '../agent-evolution.types'

export type ReleaseCommand = 'install' | 'shadow' | 'canary5' | 'canary25' | 'canary50' | 'activate' | 'experience'
export function productionPointer(release: ReleasePackage, pointers: ActiveCapabilityPointer[]) {
  return pointers.find(
    (p) => p.channel === 'production' && p.targetId === release.targetId && sameEvolutionScope(p.scope, release.scope)
  )
}
export function isServing(release: ReleasePackage, pointer: ActiveCapabilityPointer | undefined) {
  return release.status === 'active' && pointer?.activeVersionId === release.targetVersionId
}
export function nextReleaseStep(
  release: ReleasePackage,
  stages: ReleaseDeployment[],
  pointer: ActiveCapabilityPointer | undefined,
  target: EvolutionTargetDescriptor | undefined,
  hasExperience: boolean,
  now: number
) {
  const caps = target?.capabilities,
    policy = release.gatePolicy
  const available = (command: ReleaseCommand) => ({ command, reason: '', samples: 0, hours: 0, observed: 0 })
  const gate = (command: ReleaseCommand, stage: ReleaseDeployment | undefined, samples: number, hours: number) => {
    const observed = stage?.sampleCount ?? 0
    const reason = !stage
      ? 'NoStage'
      : stage.severeErrors
        ? 'SevereGate'
        : observed < samples
          ? 'SamplesGate'
          : !Number.isFinite(Date.parse(stage.startedAt)) || now - Date.parse(stage.startedAt) < hours * 3600000
            ? 'TimeGate'
            : ''
    return { command, reason, samples, hours, observed }
  }
  if (!policy || !caps) return null
  const latest = stages.at(-1)
  if (release.status === 'active') {
    if (hasExperience || !isServing(release, pointer)) return null
    return gate(
      'experience',
      stages.filter((s) => s.channel === 'production').at(-1),
      policy.experienceMinimumSamples,
      policy.experienceMinimumDurationHours
    )
  }
  let step
  if (release.status === 'approved' && caps.install) step = available('install')
  else if (['installed', 'paused'].includes(release.status) && caps.shadow) step = available('shadow')
  else if (release.status === 'shadow' && caps.canary)
    step = gate(
      'canary5',
      latest?.channel === 'shadow' ? latest : undefined,
      policy.shadowMinimumSamples,
      policy.shadowMinimumDurationHours
    )
  else if (release.status === 'canary' && caps.canary) {
    const stage = latest?.channel === 'canary' && latest.canaryPercent === release.canaryPercent ? latest : undefined
    if (release.canaryPercent === 5 || release.canaryPercent === 25)
      step = gate(
        release.canaryPercent === 5 ? 'canary25' : 'canary50',
        stage,
        policy.canaryMinimumSamples,
        policy.canaryMinimumDurationHours
      )
    else if (release.canaryPercent === 50)
      step = gate('activate', stage, policy.productionCanaryMinimumSamples, policy.productionCanaryMinimumDurationHours)
  }
  if (!step) return null
  // An older paused package must not resume distributing traffic against a different production baseline.
  if (step.command !== 'install' && (!pointer || pointer.activeVersionId !== release.rollbackVersionId))
    return { ...step, reason: 'BaselineChanged' }
  return step
}

export function reviewedCorrect(stage: ReleaseDeployment) {
  return stage.sampleCount ? Math.round(stage.sampleCount * stage.candidateAccuracy) : 0
}

/** Attribute only reviewed executions, never all issued or consumed test assignments. */
export function canaryAttribution(
  stage: ReleaseDeployment,
  samples: EvolutionRuntimeObservation[],
  overrides: EvolutionCanaryTestOverride[]
) {
  if (stage.channel !== 'canary' || stage.dataSource !== 'runtime_telemetry') return null
  const rows = samples.filter(
    (r) => r.deploymentId === stage.deploymentId && r.channel === 'canary' && sameEvolutionScope(r.scope, stage.scope)
  )
  if (rows.length !== stage.sampleCount) return null
  const forced = new Set(
    overrides
      .filter(
        (o) =>
          o.releasePackageId === stage.releasePackageId &&
          o.deploymentId === stage.deploymentId &&
          o.status === 'consumed'
      )
      .map((o) => o.consumedByExecutionId)
  )
  const specified = rows.filter((r) => forced.has(r.executionId)).length
  return { specified, natural: rows.length - specified }
}
