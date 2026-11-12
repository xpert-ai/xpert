import type {
  ActiveCapabilityPointer,
  EvolutionChangeEvaluation,
  ReleaseDeployment,
  ReleasePackage
} from '@xpert-ai/contracts'
import { releaseDecisionVerified, releaseTrendPoints } from './release-inspection'

const stage: ReleaseDeployment = {
  deploymentId: 'canary',
  releasePackageId: 'pkg',
  channel: 'canary',
  scope: { type: 'organization', key: 'test' },
  status: 'canary',
  dataSource: 'runtime_telemetry',
  sampleCount: 3,
  candidateAccuracy: 1,
  severeErrors: 0,
  canaryPercent: 50,
  observations: [],
  startedAt: '2026-11-01',
  completedAt: '2026-11-02'
}
const point = {
  observationId: 'point',
  sequence: 1,
  sampleCount: 1,
  observedAt: '2026-11-01',
  baselineAccuracy: 0,
  candidateAccuracy: 1,
  severeErrors: 0,
  p95LatencyMs: 0,
  averageCost: 0
}
it('plots cumulative points in time order, retaining measured zero and gaps for unpaired telemetry', () => {
  const telemetry = {
    ...stage,
    observations: [
      { ...point, observedAt: '2026-11-03', pairedBaselineSamples: 0 },
      { ...point, observedAt: '2026-11-02', pairedBaselineSamples: 1 },
      { ...point, sampleCount: 0 }
    ]
  }
  const replay: ReleaseDeployment = { ...stage, dataSource: 'deterministic_replay', observations: [point] }
  expect(releaseTrendPoints([telemetry, replay]).map((p) => [p.stage.dataSource, p.baseline])).toEqual([
    ['deterministic_replay', 0],
    ['runtime_telemetry', 0],
    ['runtime_telemetry', null]
  ])
})
it('only recommends keeping the active version with its bound approval, assessment and completed gates', () => {
  const r = {
    status: 'active',
    releasePackageId: 'pkg',
    candidateHash: 'signed',
    targetVersionId: 'v2',
    evaluationRunId: 'eval',
    approvalIds: ['approval']
  } as ReleasePackage
  const ptr = { activeVersionId: 'v2' } as ActiveCapabilityPointer
  const assessment = { runId: 'eval', candidateHash: 'signed', passed: true } as EvolutionChangeEvaluation
  expect(releaseDecisionVerified(r, ptr, assessment, [stage])).toBe(true)
  expect(releaseDecisionVerified(r, ptr, { ...assessment, runId: 'other' }, [stage])).toBe(false)
  expect(releaseDecisionVerified(r, ptr, { ...assessment, candidateHash: 'other' }, [stage])).toBe(false)
  expect(releaseDecisionVerified(r, { ...ptr, activeVersionId: 'v1' }, assessment, [stage])).toBe(false)
  expect(releaseDecisionVerified(r, ptr, assessment, [{ ...stage, completedAt: undefined }])).toBe(false)
  expect(
    releaseDecisionVerified(r, ptr, assessment, [stage, { ...stage, channel: 'production', severeErrors: 1 }])
  ).toBe(false)
})
