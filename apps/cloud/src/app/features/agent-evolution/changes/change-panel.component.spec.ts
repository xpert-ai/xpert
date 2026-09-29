import { signal } from '@angular/core'
import { Store } from '@cloud/app/@core/state'
import { of } from 'rxjs'
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  FEEDBACK_LEARNING_STRATEGY,
  HUMAN_PROPOSAL_STRATEGY,
  evidenceDrivenStrategy,
  type EvolutionChange
} from '@xpert-ai/contracts'
import english from '../../../../assets/i18n/en.json'
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

it('renders the submitted proposal and source after a draft failure, with an honest missing-reason fallback', async () => {
  await TestBed.configureTestingModule({
    imports: [EvolutionChangePanelComponent, TranslateModule.forRoot()],
    providers: [
      { provide: Store, useValue: { userRolePermissions$: of([]), hasPermission: () => false } },
      provideRouter([]),
      { provide: AgentEvolutionFacade, useValue: { mutating: signal(false), visibleTargets: () => [] } }
    ]
  }).compileComponents()
  const translate = TestBed.inject(TranslateService)
  translate.setTranslation('en', english)
  translate.use('en')
  const fixture = TestBed.createComponent(EvolutionChangePanelComponent)
  const item = change('failed', '')
  item.approval = undefined
  item.status = 'failed'
  item.strategy.definition = evidenceDrivenStrategy({ version: '1', evidenceKinds: ['document'], requiredChecks: [] })
  item.stages = [
    { key: 'candidate', status: 'failed' },
    { key: 'evaluation', status: 'pending' }
  ]
  item.presentation = {
    title: 'Motor color',
    resourceLabel: 'Automotive motors',
    business: {
      title: 'Add feature: Motor color',
      proposal: 'Add an optional color field.',
      rationale: 'The source requires a color.',
      context: [{ key: 'family', label: 'Product family', value: 'Automotive motors' }],
      evidence: [{ key: 'source', quote: 'The automotive motor must be blue.' }],
      changes: [],
      adoption: { subjectLabel: 'products', adopted: 0, total: 1 }
    },
    workbench: {
      xpertId: 'assistant',
      viewKey: 'view',
      selectionId: 'case',
      parameters: { productLineId: 'product', tab: 'features' }
    }
  }
  fixture.componentRef.setInput('change', item)
  fixture.detectChanges()
  const element: HTMLElement = fixture.nativeElement
  expect(element.querySelector('h2')?.textContent).toContain('Add feature: Motor color')
  expect(element.querySelector('[data-testid="change-result"]')?.textContent).toContain(
    'No detailed reason has been provided yet.'
  )
  expect(element.querySelector('[data-testid="change-evidence"]')?.textContent).toContain(
    'The automotive motor must be blue.'
  )
  expect(element.querySelector('[data-testid="change-evidence"]')?.textContent).toContain(
    'Page or location not provided'
  )
  expect(element.querySelector('[data-testid="change-proposal"]')?.textContent).toContain(
    'proposed change has not been applied'
  )
  expect(element.querySelector('[data-testid="adoption-summary"]')?.textContent).toContain(
    '1 related products; this change is not yet effective'
  )
  expect(element.querySelector('[data-stage="evaluation"]')?.getAttribute('data-status')).toBe('pending')
  expect(fixture.componentInstance.link()?.queryParams.viewParameters).toBe(
    JSON.stringify({ productLineId: 'product', tab: 'features' })
  )
  expect(fixture.componentInstance.canReview()).toBe(false)
  fixture.destroy()
})

it('renders adoption only after publication and keeps unknown domain titles neutral', async () => {
  await TestBed.configureTestingModule({
    imports: [EvolutionChangePanelComponent, TranslateModule.forRoot()],
    providers: [
      { provide: Store, useValue: { userRolePermissions$: of([]), hasPermission: () => false } },
      provideRouter([]),
      { provide: AgentEvolutionFacade, useValue: { mutating: signal(false), visibleTargets: () => [] } }
    ]
  }).compileComponents()
  const translate = TestBed.inject(TranslateService)
  translate.setTranslation('en', english)
  translate.use('en')
  const fixture = TestBed.createComponent(EvolutionChangePanelComponent)
  const item = change('published', 'Reviewed')
  item.strategy.definition = evidenceDrivenStrategy({ version: '1', evidenceKinds: ['document'], requiredChecks: [] })
  item.presentation = {
    title: 'new_feature attribute',
    resourceLabel: 'Resource',
    business: {
      title: 'Add attribute',
      context: [],
      evidence: [],
      changes: [],
      adoption: { subjectLabel: 'products', adopted: 0, total: 1 }
    }
  }
  fixture.componentRef.setInput('change', item)
  fixture.detectChanges()
  const element: HTMLElement = fixture.nativeElement
  expect(element.querySelector('[data-testid="adoption-summary"]')?.textContent).toContain(
    '0 / 1 related products use the new version'
  )
  expect(element.querySelector('[data-testid="change-result"]')?.textContent).toContain('awaiting adoption by products')
  fixture.componentRef.setInput('change', {
    ...item,
    presentation: { title: 'new_feature attribute', resourceLabel: 'Resource' }
  })
  fixture.detectChanges()
  expect(element.querySelector('h2')?.textContent).toContain('Change request: new_feature attribute')
  expect(element.querySelector('[data-testid="change-evidence"]')?.textContent).toContain('No readable source evidence')
  fixture.destroy()
})

it('replaces approval evidence and clears the review draft when switching candidates', async () => {
  await TestBed.configureTestingModule({
    imports: [EvolutionChangePanelComponent, TranslateModule.forRoot()],
    providers: [
      { provide: Store, useValue: { userRolePermissions$: of([]), hasPermission: () => false } },
      provideRouter([]),
      { provide: AgentEvolutionFacade, useValue: { mutating: signal(false), visibleTargets: () => [] } }
    ]
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

it.each([true, false])(
  'allows authorized platform review even with a provider workbench link (manage=%s)',
  async (canManage) => {
    const approveAndPublishChange = jest.fn()
    const publishApprovedChange = jest.fn()
    const mutating = signal(false)
    await TestBed.configureTestingModule({
      imports: [EvolutionChangePanelComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: Store, useValue: { userRolePermissions$: of([]), hasPermission: () => canManage } },
        {
          provide: AgentEvolutionFacade,
          useValue: { mutating, visibleTargets: () => [], approveAndPublishChange, publishApprovedChange }
        }
      ]
    }).compileComponents()
    const translate = TestBed.inject(TranslateService)
    translate.setTranslation('en', english)
    translate.use('en')
    const fixture = TestBed.createComponent(EvolutionChangePanelComponent)
    const item = change('review', '')
    item.status = 'pending_approval'
    item.approval = undefined
    item.evaluation = {
      runId: 'eval',
      passed: true,
      datasetVersion: '1',
      datasetHash: 'dataset',
      baselineHash: 'base',
      candidateHash: 'candidate',
      evidenceHash: 'evidence',
      completedAt: '2026-09-01',
      readiness: [],
      checks: []
    }
    item.presentation = {
      title: 'Automotive model change',
      resourceLabel: 'Automotive model',
      workbench: { xpertId: 'assistant', viewKey: 'view', selectionId: 'case', parameters: {} }
    }
    fixture.componentRef.setInput('change', item)
    fixture.detectChanges()
    expect(fixture.componentInstance.canReview()).toBe(canManage)
    fixture.componentInstance.reason.set('Verified the source')
    fixture.componentInstance.review('approved')
    expect(approveAndPublishChange).toHaveBeenCalledTimes(canManage ? 1 : 0)
    if (canManage) {
      const element: HTMLElement = fixture.nativeElement
      expect(element.textContent).toContain('Approve and publish')
      mutating.set(true)
      fixture.detectChanges()
      expect(element.querySelector('button[z-button]:not([zType])')?.hasAttribute('disabled')).toBe(true)
      fixture.componentInstance.review('approved')
      expect(approveAndPublishChange).toHaveBeenCalledTimes(1)
      mutating.set(false)
    }
    fixture.componentRef.setInput('change', { ...item, status: 'approved' })
    fixture.detectChanges()
    expect(fixture.componentInstance.canPublish()).toBe(canManage)
    fixture.componentRef.setInput('change', { ...item, status: 'publishing' })
    fixture.detectChanges()
    expect(fixture.componentInstance.canPublish()).toBe(canManage)
    fixture.componentInstance.publish()
    expect(publishApprovedChange).toHaveBeenCalledTimes(canManage ? 1 : 0)
    fixture.componentRef.setInput('change', { ...item, evaluation: { ...item.evaluation, passed: false } })
    fixture.detectChanges()
    expect(fixture.componentInstance.canReview()).toBe(false)
    fixture.destroy()
  }
)

it('keeps staged rollout review and publication separate', async () => {
  const approveCandidate = jest.fn()
  const packageRelease = jest.fn()
  const approveAndPublishChange = jest.fn()
  await TestBed.configureTestingModule({
    imports: [EvolutionChangePanelComponent, TranslateModule.forRoot()],
    providers: [
      provideRouter([]),
      { provide: Store, useValue: { userRolePermissions$: of([]), hasPermission: () => true } },
      {
        provide: AgentEvolutionFacade,
        useValue: {
          mutating: signal(false),
          visibleTargets: () => [],
          approveCandidate,
          packageRelease,
          approveAndPublishChange
        }
      }
    ]
  }).compileComponents()
  const fixture = TestBed.createComponent(EvolutionChangePanelComponent)
  const item = change('staged', '')
  item.strategy = { ...item.strategy, definition: FEEDBACK_LEARNING_STRATEGY }
  item.status = 'pending_approval'
  item.approval = undefined
  item.evaluation = {
    runId: 'eval',
    passed: true,
    datasetVersion: '1',
    datasetHash: 'dataset',
    baselineHash: 'base',
    candidateHash: 'candidate',
    evidenceHash: 'evidence',
    completedAt: '2026-09-01',
    readiness: [],
    checks: []
  }
  fixture.componentRef.setInput('change', item)
  fixture.detectChanges()
  fixture.componentInstance.reason.set('Reviewed')
  fixture.componentInstance.review('approved')
  expect(approveCandidate).toHaveBeenCalledWith('staged', 'eval', 'Reviewed')
  expect(approveAndPublishChange).not.toHaveBeenCalled()
  fixture.componentRef.setInput('change', { ...item, status: 'approved' })
  fixture.detectChanges()
  fixture.componentInstance.publish()
  expect(packageRelease).toHaveBeenCalledWith('staged', 'eval', [])
  fixture.destroy()
})
