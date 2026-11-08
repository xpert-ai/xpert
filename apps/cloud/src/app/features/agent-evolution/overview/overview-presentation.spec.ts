import type {
  ActiveCapabilityPointer,
  EvaluationRun,
  EvolutionLifecycleRecord,
  ReleaseDeployment,
  ReleasePackage
} from '@xpert-ai/contracts'
import { activeImprovement, overviewRate, overviewTasks } from './overview-presentation'

const scope = { type: 'organization', key: 'one' }
const ptr = {
  channel: 'production',
  targetId: 'support',
  activeVersionId: 'v2',
  releasePackageId: 'release',
  scope,
  updatedAt: '2026-02-01'
} as ActiveCapabilityPointer
const release = {
  releasePackageId: 'release',
  targetId: 'support',
  targetVersionId: 'v2',
  status: 'active',
  scope
} as ReleasePackage
const rec = {
  id: 'change',
  title: 'Routing',
  releasePackageId: 'release',
  targetId: 'support',
  scope
} as EvolutionLifecycleRecord
const dep = {
  releasePackageId: 'release',
  scope,
  channel: 'production',
  dataSource: 'runtime_telemetry',
  sampleCount: 5,
  candidateAccuracy: 0.8
} as ReleaseDeployment

it('requires a current production pointer with the exact release, version and scope', () => {
  for (const wrong of [
    { activeVersionId: 'v1' },
    { releasePackageId: 'old' },
    { scope: { ...scope, key: 'two' } },
    { channel: 'canary' }
  ]) {
    expect(activeImprovement([{ ...ptr, ...wrong } as ActiveCapabilityPointer], [release], [dep], [rec])).toBeNull()
  }
  expect(activeImprovement([ptr], [{ ...release, status: 'rolled_back' }], [dep], [rec])).toBeNull()
})
it('counts production telemetry once, excluding canary, replay and other scopes', () => {
  const other = [
    { channel: 'canary' },
    { dataSource: 'deterministic_replay' },
    { scope: { ...scope, key: 'two' } },
    { releasePackageId: 'old' }
  ].map((x) => ({ ...dep, ...x }) as ReleaseDeployment)
  expect(activeImprovement([ptr], [release], [...other, dep], [rec])).toMatchObject({ passed: 4, samples: 5 })
  expect(activeImprovement([ptr], [release], other, [rec])).toMatchObject({ samples: 0 })
})
it('opens a failed case only when the assessment references its exact replay run', () => {
  const failed = {
    ...rec,
    phase: 'blocked',
    status: 'test_failed',
    evaluation: { passed: false, checks: [{ evidenceRefs: ['bound'] }] }
  } as EvolutionLifecycleRecord
  const unrelated = {
    runId: 'old',
    candidateId: 'change',
    caseResults: [{ caseId: 'wrong', candidatePassed: false }]
  } as EvaluationRun
  const bound = {
    ...unrelated,
    runId: 'bound',
    caseResults: [
      { caseId: 'ok', candidatePassed: true },
      { caseId: 'bad', candidatePassed: false }
    ]
  } as EvaluationRun
  expect(overviewTasks([failed], [], [], [unrelated, bound])[0]).toMatchObject({
    action: 'ViewFailures',
    fragment: 'samples',
    query: { changeId: 'change', runId: 'bound', caseId: 'bad' }
  })
  expect(overviewTasks([failed], [], [], [{ ...bound, caseResults: [] }])[0]).toMatchObject({
    action: 'ViewAssessment',
    fragment: 'samples',
    query: { runId: 'bound' }
  })
  expect(overviewTasks([failed], [], [], [unrelated])[0]).toMatchObject({
    action: 'ViewAssessment',
    query: { changeId: 'change' }
  })
})
it('counts evaluated changes, and preserves absence of a denominator', () => {
  expect(overviewRate([rec])).toEqual({ passed: 0, total: 0 })
  expect(
    overviewRate([
      rec,
      { ...rec, evaluation: { passed: true } },
      { ...rec, evaluation: { passed: false } }
    ] as EvolutionLifecycleRecord[])
  ).toEqual({ passed: 1, total: 2 })
})
