import type {
  ActiveCapabilityPointer,
  EvolutionRuntimeObservation,
  EvolutionCanaryTestOverride,
  EvolutionTargetDescriptor,
  ReleaseDeployment,
  ReleasePackage
} from '@xpert-ai/contracts'
import { nextReleaseStep, productionPointer, isServing, canaryAttribution } from './release-presentation'

const scope = { type: 'organization' as const, key: 'site' }
const pack = {
  releasePackageId: 'r',
  candidateId: 'candidate',
  targetId: 'target',
  scope,
  status: 'canary',
  canaryPercent: 50,
  targetVersionId: 'new',
  rollbackVersionId: 'base',
  gatePolicy: { productionCanaryMinimumSamples: 5, productionCanaryMinimumDurationHours: 1 }
} as ReleasePackage
const ptr = { channel: 'production', targetId: 'target', scope, activeVersionId: 'base' } as ActiveCapabilityPointer
const target = { capabilities: { canary: true, shadow: true } } as EvolutionTargetDescriptor
const stage = {
  releasePackageId: 'r',
  deploymentId: 'd',
  channel: 'canary',
  scope,
  dataSource: 'runtime_telemetry',
  canaryPercent: 50,
  sampleCount: 5,
  severeErrors: 0,
  startedAt: '2026-11-08T00:00:00Z'
} as ReleaseDeployment
const now = Date.parse('2026-11-08T01:00:00Z')
it('only reports full activation for the matching production pointer and scope', () => {
  const active = { ...pack, status: 'active' as const }
  const irrelevant = [
    { ...ptr, channel: 'shadow' as const, activeVersionId: 'new' },
    { ...ptr, scope: { ...scope, key: 'other' }, activeVersionId: 'new' }
  ]
  expect(isServing(active, productionPointer(active, irrelevant))).toBe(false)
  expect(isServing(active, productionPointer(active, [...irrelevant, ptr]))).toBe(false)
  expect(isServing(active, { ...ptr, activeVersionId: 'new' })).toBe(true)
})
it('requires the corresponding 50% stage, sufficient samples, elapsed time, zero severe errors and a current baseline', () => {
  const next = (stageList: ReleaseDeployment[], time = now, pointer = ptr) =>
    nextReleaseStep(pack, stageList, pointer, target, false, time)
  expect(next([stage])).toMatchObject({ command: 'activate', reason: '' })
  expect(next([{ ...stage, canaryPercent: 25 }])?.reason).toBe('NoStage')
  expect(next([{ ...stage, sampleCount: 4 }])?.reason).toBe('SamplesGate')
  expect(next([stage], now - 1)?.reason).toBe('TimeGate')
  expect(next([{ ...stage, severeErrors: 1 }])?.reason).toBe('SevereGate')
  expect(
    nextReleaseStep({ ...pack, status: 'paused' }, [stage], { ...ptr, activeVersionId: 'other' }, target, false, now)
      ?.reason
  ).toBe('BaselineChanged')
})
it('attributes only consumed overrides matched to the reviewed stage executions', () => {
  const stage2 = { ...stage, sampleCount: 2 }
  const rows = ['natural', 'forced'].map((executionId) => ({
    observationId: executionId,
    observedAt: '2026-11-08T00:00:00Z',
    targetId: 'target',
    scope,
    channel: 'canary',
    deploymentId: 'd',
    executionId
  })) as EvolutionRuntimeObservation[]
  const overrides = ['forced', 'unreviewed'].map((consumedByExecutionId) => ({
    releasePackageId: 'r',
    scope,
    targetId: 'target',
    candidateId: 'candidate',
    deploymentId: 'd',
    status: 'consumed',
    consumedByExecutionId
  })) as EvolutionCanaryTestOverride[]
  expect(canaryAttribution(stage2, pack, rows, overrides)).toEqual({ natural: 1, specified: 1 })
  expect(canaryAttribution(stage2, pack, rows, null)).toBeNull()
  expect(canaryAttribution(stage2, pack, rows, [{ ...overrides[0], consumedByExecutionId: undefined }])).toBeNull()
  expect(
    canaryAttribution(stage2, pack, rows, [{ ...overrides[0], scope: { type: 'organization', key: 'other' } }])
  ).toEqual({ natural: 2, specified: 0 })
  expect(
    canaryAttribution(
      stage2,
      pack,
      [...rows, { ...rows[0], deploymentId: 'production', channel: 'production' }],
      overrides
    )
  ).toEqual({ natural: 1, specified: 1 })
  expect(canaryAttribution(stage2, pack, rows.slice(0, 1), overrides)).toBeNull()
  expect(canaryAttribution({ ...stage2, dataSource: 'deterministic_replay' }, pack, rows, overrides)).toBeNull()
})
