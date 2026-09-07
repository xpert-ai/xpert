import { ComponentFixture, TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { KnowledgeWikiDocumentProgress } from '@xpert-ai/contracts'
import { of } from 'rxjs'
import en from '../../../../../../assets/i18n/en.json'
import zhHans from '../../../../../../assets/i18n/zh-Hans.json'
import zhHant from '../../../../../../assets/i18n/zh-Hant.json'
import { KnowledgeWikiService, ToastrService } from '../../../../../@core'
import { DocumentWikiProgressComponent } from './document-wiki-progress.component'

describe('Document Wiki progress UI', () => {
  let fixture: ComponentFixture<DocumentWikiProgressComponent>
  const api = { retryJob: jest.fn(() => of({})) }
  const progress: KnowledgeWikiDocumentProgress = {
    documentId: 'doc',
    state: 'indexing',
    canView: false,
    stages: { generation: 'complete', indexing: 'running', publication: 'pending' }
  }
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DocumentWikiProgressComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: KnowledgeWikiService, useValue: api },
        { provide: ToastrService, useValue: { danger: jest.fn() } }
      ]
    }).compileComponents()
    TestBed.inject(TranslateService).use('en')
    fixture = TestBed.createComponent(DocumentWikiProgressComponent)
    fixture.componentRef.setInput('knowledgebaseId', 'kb')
    fixture.componentRef.setInput('progress', progress)
  })
  afterEach(() => {
    fixture?.destroy()
    jest.restoreAllMocks()
    api.retryJob.mockClear()
  })
  const root = () => fixture.nativeElement as HTMLElement
  it('renders one compact state in a list, without adding a details section', () => {
    fixture.detectChanges()
    expect(root().querySelectorAll('[data-wiki-state]')).toHaveLength(1)
    expect(root().querySelector('section')).toBeNull()
    expect(root().textContent).toContain('indexing')
  })
  it('renders three real stage states in the inspector', () => {
    fixture.componentRef.setInput('details', true)
    fixture.detectChanges()
    expect([...root().querySelectorAll('[data-wiki-stage]')].map((node) => node.getAttribute('data-state'))).toEqual([
      'complete',
      'running',
      'pending'
    ])
    expect(root().querySelector('a')).toBeNull()
  })
  it('provides the Wiki route only when current published content is available', () => {
    fixture.componentRef.setInput('details', true)
    fixture.componentRef.setInput('progress', { ...progress, state: 'ready', canView: true })
    fixture.detectChanges()
    expect(root().querySelector('a').getAttribute('href')).toBe('/xpert/knowledges/kb/wiki')
  })
  it('does not pretend an unavailable status is a generation failure', () => {
    fixture.componentRef.setInput('progress', undefined)
    fixture.componentRef.setInput('details', true)
    fixture.detectChanges()
    expect(root().querySelector('[data-wiki-state]').getAttribute('data-wiki-state')).toBe('unknown')
    expect(root().querySelectorAll('[data-wiki-stage]')).toHaveLength(0)
  })
  it('retries a known-not-sent failure without a charge confirmation', async () => {
    fixture.componentRef.setInput('details', true)
    fixture.componentRef.setInput('progress', {
      ...progress,
      state: 'failed',
      error: 'model schema error',
      retry: { jobId: 'job', requiresAdditionalChargeConfirmation: false }
    })
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false)
    fixture.detectChanges()
    root().querySelector<HTMLButtonElement>('[data-wiki-retry]').click()
    await fixture.whenStable()
    expect(confirm).not.toHaveBeenCalled()
    expect(api.retryJob).toHaveBeenCalledWith('kb', 'job', false)
  })
  it('does not repeat an uncertain paid invocation without confirmation', async () => {
    fixture.componentRef.setInput('details', true)
    fixture.componentRef.setInput('progress', {
      ...progress,
      state: 'failed',
      retry: { jobId: 'job', requiresAdditionalChargeConfirmation: true }
    })
    jest.spyOn(window, 'confirm').mockReturnValue(false)
    fixture.detectChanges()
    root().querySelector<HTMLButtonElement>('[data-wiki-retry]').click()
    await fixture.whenStable()
    expect(api.retryJob).not.toHaveBeenCalled()
  })
  it.each([
    ['en', en, 'Retry', 'Wiki search indexing failed'],
    ['zh-Hans', zhHans, '重试', 'Wiki 检索索引失败'],
    ['zh-Hant', zhHant, '重試', 'Wiki 檢索索引失敗']
  ])('translates the retry action and persisted indexing failure in %s', (language, resources, retry, error) => {
    const translate = TestBed.inject(TranslateService)
    translate.setTranslation(language, resources)
    translate.use(language)
    fixture.componentRef.setInput('details', true)
    fixture.componentRef.setInput('progress', {
      ...progress,
      state: 'failed',
      error: 'duplicate key value violates unique constraint',
      errorCode: 'knowledge_wiki_index_failed',
      retry: { jobId: 'job', requiresAdditionalChargeConfirmation: false }
    })
    fixture.detectChanges()
    expect(root().querySelector('[data-wiki-retry]').textContent.trim()).toBe(retry)
    expect(root().querySelector('[role=alert]').textContent).toContain(error)
    expect(root().querySelector('[role=alert]').textContent).not.toContain('duplicate key')
  })
})
