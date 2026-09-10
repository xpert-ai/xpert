import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { HUMAN_PROPOSAL_STRATEGY, type EvolutionChange } from '@xpert-ai/contracts'
import { EvolutionChangePanelComponent } from './change-panel.component'
import { AgentEvolutionFacade } from '../agent-evolution.facade'

const change = (id: string, reason: string): EvolutionChange => ({
  contractVersion: 3,
  changeId: id,
  requestId: id,
  targetId: 'test.template',
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
  scope: { type: 'organization', key: 'org' },
  baseline: { resourceId: 'base', version: '1', hash: 'base' },
  evidence: [],
  evidenceHash: 'evidence',
  status: 'published',
  jobId: id,
  createdBy: 'u',
  createdAt: '2026-09-08T00:00:00Z',
  updatedAt: '2026-09-08T00:00:00Z',
  approval: {
    approvalId: `APR-${id}`,
    candidateId: id,
    candidateHash: id,
    evaluationRunId: id,
    decision: 'approved',
    actorId: 'reviewer',
    actorRole: 'reviewer',
    reason,
    decidedAt: '2026-09-08T00:00:00Z'
  }
})

it('replaces approval evidence and clears the review draft when switching candidates', async () => {
  await TestBed.configureTestingModule({
    imports: [EvolutionChangePanelComponent, TranslateModule.forRoot()],
    providers: [provideRouter([]), { provide: AgentEvolutionFacade, useValue: { visibleTargets: () => [] } }]
  }).compileComponents()
  const fixture = TestBed.createComponent(EvolutionChangePanelComponent)
  fixture.componentRef.setInput('change', change('A', 'Reviewed candidate A'))
  fixture.detectChanges()
  fixture.componentInstance.reason.set('Draft for candidate A')
  expect(fixture.nativeElement.textContent).toContain('Reviewed candidate A')
  fixture.componentRef.setInput('change', change('B', 'Reviewed candidate B'))
  fixture.detectChanges()
  expect(fixture.nativeElement.textContent).toContain('Reviewed candidate B')
  expect(fixture.nativeElement.textContent).not.toContain('Reviewed candidate A')
  expect(fixture.componentInstance.reason()).toBe('')
  fixture.destroy()
})
