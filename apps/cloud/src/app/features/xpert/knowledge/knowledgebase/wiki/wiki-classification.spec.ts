import { signal } from '@angular/core'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import type { KnowledgeWikiClassificationItem } from '@xpert-ai/contracts'
import { of, Subject, throwError } from 'rxjs'
import { KnowledgeWikiService, ToastrService } from '../../../../../@core'
import { KnowledgebaseComponent } from '../knowledgebase.component'
import { KnowledgeWikiComponent } from './wiki.component'

jest.mock('@milkdown/crepe', () => ({ Crepe: jest.fn() }))
jest.mock('mermaid', () => ({ initialize: jest.fn(), render: jest.fn() }))
jest.mock('@xterm/xterm', () => ({ Terminal: jest.fn() }))

const item: KnowledgeWikiClassificationItem = {
  jobId: 'job',
  runId: 'run',
  pageId: 'page',
  title: 'Page',
  status: 'running',
  requiresAdditionalChargeConfirmation: false
}

describe('Wiki classification without a dialog', () => {
  let fixture: ComponentFixture<KnowledgeWikiComponent>
  const id = signal('kb')
  const service = {
    getClassificationStatus: jest.fn(() => of({ activeJobs: 0 })),
    getStatus: jest.fn(),
    getPages: jest.fn(),
    getTaxonomy: jest.fn(),
    getClassifications: jest.fn(),
    classify: jest.fn(),
    retryJob: jest.fn()
  }
  const toastr = { success: jest.fn(), danger: jest.fn(), warning: jest.fn() }

  beforeEach(async () => {
    jest.useFakeTimers()
    id.set('kb')
    service.getClassificationStatus.mockReturnValue(of({ activeJobs: 0 }))
    service.getStatus.mockReturnValue(of({ enabled: true, canManage: true, status: 'ready', recoveryActions: [] }))
    service.getPages.mockReturnValue(of({ items: [], total: 0 }))
    service.getTaxonomy.mockReturnValue(
      of({ enabled: false, revision: 0, folders: [], total: 2, unclassifiedCount: 2 })
    )
    service.getClassifications.mockReturnValue(of([]))
    service.classify.mockReturnValue(of({ runId: 'run', count: 1, truncated: false }))
    service.retryJob.mockReturnValue(of({}))
    await TestBed.configureTestingModule({
      imports: [KnowledgeWikiComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: KnowledgeWikiService, useValue: service },
        { provide: KnowledgebaseComponent, useValue: { paramId: id, knowledgebase: signal(undefined) } },
        { provide: ToastrService, useValue: toastr }
      ]
    })
      .overrideComponent(KnowledgeWikiComponent, { set: { template: '' } })
      .compileComponents()
    fixture = TestBed.createComponent(KnowledgeWikiComponent)
    fixture.autoDetectChanges()
    await jest.advanceTimersByTimeAsync(0)
  })
  afterEach(() => {
    fixture.destroy()
    jest.useRealTimers()
    jest.restoreAllMocks()
    jest.clearAllMocks()
    TestBed.resetTestingModule()
  })

  it('restores loading on page entry without submitting or retrying model work', async () => {
    fixture.destroy()
    service.getClassificationStatus.mockReturnValue(of({ activeJobs: 1 }))
    service.getClassifications.mockReturnValue(of([item]))
    fixture = TestBed.createComponent(KnowledgeWikiComponent)
    fixture.autoDetectChanges()
    await jest.advanceTimersByTimeAsync(0)
    expect(fixture.componentInstance.classifying()).toBe(true)
    expect(service.classify).not.toHaveBeenCalled()
    expect(service.retryJob).not.toHaveBeenCalled()
    service.getClassificationStatus.mockReturnValue(of({ activeJobs: 0 }))
    service.getClassifications.mockReturnValue(of([{ ...item, status: 'succeeded', outcome: 'applied' }]))
    await jest.advanceTimersByTimeAsync(3000)
    expect(fixture.componentInstance.classifying()).toBe(false)
  })

  it('keeps loading when active jobs are outside the recent result window', async () => {
    fixture.destroy()
    service.getClassificationStatus.mockReturnValue(of({ activeJobs: 1 }))
    service.getClassifications.mockReturnValue(of([]))
    fixture = TestBed.createComponent(KnowledgeWikiComponent)
    fixture.autoDetectChanges()
    await jest.advanceTimersByTimeAsync(3000)
    expect(fixture.componentInstance.classifying()).toBe(true)
    expect(service.classify).not.toHaveBeenCalled()
    expect(service.retryJob).not.toHaveBeenCalled()
  })

  it('starts with no folders or automation switch and stays busy until results are applied', async () => {
    const confirm = jest.spyOn(window, 'confirm')
    service.getClassifications.mockReturnValueOnce(of([])).mockReturnValue(of([item]))
    const component = fixture.componentInstance
    const started = component.classifyPages()
    expect(component.classifying()).toBe(true)
    await component.classifyPages()
    await started
    expect(service.classify).toHaveBeenCalledTimes(1)
    expect(service.classify).toHaveBeenCalledWith('kb')
    expect(component.classifying()).toBe(true)
    expect(confirm).not.toHaveBeenCalled()
    const refresh = jest.spyOn(component, 'classificationChanged')
    service.getClassifications.mockReturnValue(of([{ ...item, status: 'succeeded', outcome: 'applied' }]))
    await jest.advanceTimersByTimeAsync(3000)
    expect(component.classifying()).toBe(false)
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(toastr.success).toHaveBeenCalledWith('XP.Knowledgebase.Wiki.Organization.ClassificationDone', { count: 1 })
    const calls = service.getClassifications.mock.calls.length
    await jest.advanceTimersByTimeAsync(6000)
    expect(service.getClassifications).toHaveBeenCalledTimes(calls)
  })

  it('resumes a running task instead of submitting another run', async () => {
    const olderFailure: KnowledgeWikiClassificationItem = {
      ...item,
      jobId: 'older-job',
      status: 'failed',
      error: 'Older failure'
    }
    service.getClassifications.mockReturnValue(of([item, olderFailure]))
    const component = fixture.componentInstance
    await component.classifyPages()
    expect(component.classifying()).toBe(true)
    expect(service.classify).not.toHaveBeenCalled()
    service.getClassifications.mockReturnValue(of([{ ...item, status: 'succeeded', outcome: 'applied' }, olderFailure]))
    await jest.advanceTimersByTimeAsync(3000)
    expect(component.classifying()).toBe(false)
    expect(toastr.danger).not.toHaveBeenCalled()
    expect(toastr.success).toHaveBeenCalledWith('XP.Knowledgebase.Wiki.Organization.ClassificationDone', { count: 1 })
  })

  it('checks durable activity before retrying older failures on a click', async () => {
    service.getClassificationStatus.mockReturnValue(of({ activeJobs: 1 }))
    service.getClassifications.mockReturnValue(of([{ ...item, jobId: 'old-job', status: 'failed' }]))
    await fixture.componentInstance.classifyPages()
    expect(fixture.componentInstance.classifying()).toBe(true)
    expect(service.classify).not.toHaveBeenCalled()
    expect(service.retryJob).not.toHaveBeenCalled()
    service.getClassificationStatus.mockReturnValue(of({ activeJobs: 0 }))
    await jest.advanceTimersByTimeAsync(3000)
    expect(fixture.componentInstance.classifying()).toBe(false)
    expect(toastr.danger).not.toHaveBeenCalled()
  })

  it('releases the button after a polling error and checks existing jobs on the next click', async () => {
    service.getClassifications.mockReturnValueOnce(of([])).mockReturnValue(of([item]))
    const component = fixture.componentInstance
    await component.classifyPages()
    service.getClassifications.mockReturnValueOnce(throwError(() => new Error('Network unavailable')))
    await jest.advanceTimersByTimeAsync(3000)
    expect(component.classifying()).toBe(false)
    expect(toastr.danger).toHaveBeenCalledWith(expect.objectContaining({ message: 'Network unavailable' }))
    await component.classifyPages()
    expect(component.classifying()).toBe(true)
    expect(service.classify).toHaveBeenCalledTimes(1)
  })

  it('retries each failed job once, including taxonomy jobs covering multiple pages', async () => {
    service.getClassifications
      .mockReturnValueOnce(
        of([
          { ...item, status: 'failed' },
          { ...item, pageId: 'another-page', status: 'failed' }
        ])
      )
      .mockReturnValue(of([item]))
    await fixture.componentInstance.classifyPages()
    expect(service.retryJob).toHaveBeenCalledTimes(1)
    expect(service.retryJob).toHaveBeenCalledWith('kb', 'job', false)
    expect(service.classify).not.toHaveBeenCalled()
    expect(fixture.componentInstance.classifying()).toBe(true)
  })

  it('does not open confirmation dialogs or authorize duplicate charges when a retry is rejected', async () => {
    const confirm = jest.spyOn(window, 'confirm')
    service.getClassifications.mockReturnValue(
      of([{ ...item, status: 'failed', requiresAdditionalChargeConfirmation: true }])
    )
    service.retryJob.mockReturnValue(throwError(() => new Error('Charge confirmation required')))
    await fixture.componentInstance.classifyPages()
    expect(confirm).not.toHaveBeenCalled()
    expect(service.retryJob).toHaveBeenCalledWith('kb', 'job', false)
    expect(service.classify).not.toHaveBeenCalled()
    expect(fixture.componentInstance.classifying()).toBe(false)
    expect(toastr.danger).toHaveBeenCalledWith(expect.objectContaining({ message: 'Charge confirmation required' }))
  })

  it('reports a failed job and restores the button after polling finishes', async () => {
    service.getClassifications
      .mockReturnValueOnce(of([]))
      .mockReturnValue(of([{ ...item, status: 'failed', error: 'Model unavailable' }]))
    await fixture.componentInstance.classifyPages()
    expect(fixture.componentInstance.classifying()).toBe(false)
    expect(toastr.danger).toHaveBeenCalledWith('Model unavailable')
    expect(toastr.success).not.toHaveBeenCalled()
  })

  it('reports an empty run without starting a poll timer', async () => {
    service.classify.mockReturnValue(of({ runId: 'empty', count: 0, truncated: false }))
    await fixture.componentInstance.classifyPages()
    expect(fixture.componentInstance.classifying()).toBe(false)
    expect(toastr.success).toHaveBeenCalledWith('XP.Knowledgebase.Wiki.Organization.NoEligiblePages')
    expect(jest.getTimerCount()).toBe(0)
  })

  it('preserves the batch limit and offers continuation through the same button', async () => {
    service.classify.mockReturnValue(of({ runId: 'run', count: 100, truncated: true }))
    service.getClassifications
      .mockReturnValueOnce(of([]))
      .mockReturnValue(of([{ ...item, status: 'succeeded', outcome: 'applied' }]))
    await fixture.componentInstance.classifyPages()
    expect(fixture.componentInstance.classifying()).toBe(false)
    expect(toastr.warning).toHaveBeenCalledWith('XP.Knowledgebase.Wiki.Organization.ClassificationBatchDone')
    expect(service.classify).toHaveBeenCalledTimes(1)
  })

  it('does not start work if the knowledgebase changes during the initial read', async () => {
    const delayed = new Subject<KnowledgeWikiClassificationItem[]>()
    service.getClassifications.mockReturnValue(delayed)
    const pending = fixture.componentInstance.classifyPages()
    id.set('other-kb')
    fixture.detectChanges()
    delayed.next([])
    await pending
    await jest.advanceTimersByTimeAsync(0)
    expect(service.classify).not.toHaveBeenCalled()
    expect(fixture.componentInstance.classifying()).toBe(false)
  })

  it('ignores old polling responses and stops polling when leaving the page', async () => {
    service.getClassifications.mockReturnValue(of([item]))
    await fixture.componentInstance.classifyPages()
    const delayed = new Subject<KnowledgeWikiClassificationItem[]>()
    service.getClassifications.mockReturnValue(delayed)
    await jest.advanceTimersByTimeAsync(3000)
    const calls = service.getClassifications.mock.calls.length
    fixture.destroy()
    delayed.next([{ ...item, status: 'failed', error: 'Old task error' }])
    await jest.advanceTimersByTimeAsync(6000)
    expect(service.getClassifications).toHaveBeenCalledTimes(calls)
    expect(toastr.danger).not.toHaveBeenCalled()
    expect(toastr.success).not.toHaveBeenCalled()
  })
})
