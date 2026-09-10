import {
  HUMAN_PROPOSAL_STRATEGY,
  type EvaluationRun,
  type EvolutionChange,
  type EvolutionLifecycleRecord
} from '@xpert-ai/contracts'
import {
  evolutionEntries,
  changeWorkbenchLink,
  selectedEvolutionEntry,
  selectedReplayEvaluation
} from './evolution-change-presentation'
const change: EvolutionChange = {
  contractVersion: 3,
  changeId: 'CHANGE',
  requestId: 'REQ',
  targetId: 'template',
  scope: { type: 'organization', key: 'org' },
  baseline: { resourceId: 'BASE', version: '1', hash: 'BASE' },
  evidence: [],
  evidenceHash: 'proof',
  strategy: {
    definition: HUMAN_PROPOSAL_STRATEGY,
    riskLevel: 'R1',
    hash: 'strategy',
    providerKey: 'template',
    providerVersion: '1'
  },
  sourceKind: 'manual',
  learningEventIds: [],
  candidateInput: {},
  datasetSnapshotIds: {},
  stages: [],
  status: 'published',
  jobId: 'JOB',
  createdBy: 'u',
  createdAt: '2026-09-08',
  updatedAt: '2026-09-08',
  presentation: {
    title: 'Template',
    resourceLabel: 'Support',
    workbench: {
      xpertId: 'assistant',
      viewKey: 'templates',
      selectionId: 'template-1',
      parameters: { tab: 'preview' }
    },
    historyWorkbench: {
      xpertId: 'assistant',
      viewKey: 'templates',
      selectionId: 'template-1',
      parameters: { tab: 'history' }
    }
  }
}
const record: EvolutionLifecycleRecord = {
  id: 'CHANGE',
  targetId: 'template',
  title: 'Template',
  scope: change.scope,
  baseline: change.baseline,
  phase: 'effective',
  status: 'published',
  strategy: change.strategy,
  stages: [],
  sourceKind: 'manual',
  publicationStatus: 'published',
  effectStatus: 'active',
  approvals: [],
  createdAt: change.createdAt,
  updatedAt: change.updatedAt,
  capabilities: { stagedRollout: false, evaluate: false, decide: false, publish: false }
}
it('filters by state without a fixed domain or change type list', () => {
  const records = [
    record,
    {
      ...record,
      id: 'RULE',
      status: 'canary_running',
      publicationStatus: 'publishing' as const,
      phase: 'publication' as const
    }
  ]
  const entries = evolutionEntries(records, [], 'evaluation')
  expect(selectedEvolutionEntry(entries, 'published', null)?.id).toBe('CHANGE')
  expect(selectedEvolutionEntry(entries, 'publishing', null)?.id).toBe('RULE')
  expect(selectedEvolutionEntry(entries, 'all', 'missing')).toBeNull()
  expect(selectedEvolutionEntry(entries, 'publishing', 'CHANGE')).toBeNull()
})
it('keeps preparation in candidates and publication in release', () => {
  expect(evolutionEntries([{ ...record, phase: 'preparation' }], [], 'release')).toEqual([])
  expect(evolutionEntries([record, { ...record, id: 'reviewed', phase: 'publication' }], [], 'release')).toHaveLength(2)
})
it('selects the shared record identity without a second reference lookup', () => {
  const entries = [{ ...record, id: 'candidate', releasePackageId: 'release' }]
  expect(selectedEvolutionEntry(entries, 'all', 'candidate')?.id).toBe('candidate')
  expect(selectedEvolutionEntry(entries, 'all', 'release')).toBeNull()
})
it('preserves provider-defined navigation without product or BOM assumptions', () => {
  const link = changeWorkbenchLink(change, 'release')!
  expect(link.commands).toEqual(['/chat/x', 'assistant', 'c'])
  expect(link.queryParams.viewSelection).toBe('template-1')
  expect(JSON.parse(link.queryParams.viewParameters)).toEqual({ tab: 'history' })
  expect(changeWorkbenchLink({ ...change, presentation: undefined }, 'evaluation')).toBeNull()
})

it('uses the exact replay evidence of the common assessment, never another candidate or an unreferenced run', () => {
  const runs = [
    { candidateId: 'candidate', runId: 'old-replay' },
    { candidateId: 'other', runId: 'replay' },
    { candidateId: 'candidate', runId: 'replay' }
  ] as EvaluationRun[]
  const assessment = { runId: 'ASSESS-replay', checks: [{ evidenceRefs: ['replay'] }] } as NonNullable<
    EvolutionChange['evaluation']
  >
  expect(selectedReplayEvaluation(runs, assessment, 'candidate')).toBe(runs[2])
  expect(selectedReplayEvaluation(runs, undefined, 'candidate')).toBeNull()
  expect(selectedReplayEvaluation(runs, assessment, 'missing')).toBeNull()
})
