import { provideHttpClient } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { signal } from '@angular/core'
import { By } from '@angular/platform-browser'
import { KnowledgeRetrievalSettingsComponent } from '@cloud/app/@shared/knowledge'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { provideNoopAnimations } from '@angular/platform-browser/animations'
import { provideRouter } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { NGXLogger } from 'ngx-logger'
import { of } from 'rxjs'
import { AiModelTypeEnum, IKnowledgebase, KnowledgebaseTypeEnum, Store, ToastrService } from '../../../../../@core'
import { KnowledgebaseComponent } from '../knowledgebase.component'
import { KnowledgeTestComponent } from './test.component'

jest.mock('@milkdown/crepe', () => ({ Crepe: jest.fn() }))
jest.mock('mermaid', () => ({ initialize: jest.fn(), render: jest.fn() }))
jest.mock('@xterm/xterm', () => ({ Terminal: jest.fn() }))

describe('Wiki retrieval test content scope', () => {
  let fixture: ComponentFixture<KnowledgeTestComponent>
  let root: HTMLElement
  let http: HttpTestingController
  const knowledgebase = signal<IKnowledgebase>(null)

  async function settle() {
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    for (const request of http.match((request) => request.method === 'GET')) {
      request.flush(
        request.request.url.includes('/copilot/models') || request.request.url.includes('parameter-rules')
          ? []
          : { items: [], total: 0 }
      )
    }
    fixture.detectChanges()
  }

  async function render(enabled?: boolean, type = KnowledgebaseTypeEnum.Standard) {
    knowledgebase.set({
      id: 'kb-1',
      name: 'Retrieval test',
      type,
      recall: { mode: 'vector', topK: 10 },
      wikiConfig: enabled === undefined ? undefined : { enabled }
    } as IKnowledgebase)
    await TestBed.configureTestingModule({
      imports: [KnowledgeTestComponent, TranslateModule.forRoot()],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: KnowledgebaseComponent, useValue: { knowledgebase, refresh: jest.fn() } },
        { provide: Store, useValue: { selectOrganizationId: () => of('org-1'), preferredLanguage$: of('en') } },
        { provide: NGXLogger, useValue: {} },
        { provide: ToastrService, useValue: { error: jest.fn() } }
      ]
    }).compileComponents()
    fixture = TestBed.createComponent(KnowledgeTestComponent)
    root = fixture.nativeElement
    http = TestBed.inject(HttpTestingController)
    await settle()
  }

  async function choose(value: string) {
    const header = root.querySelector<HTMLElement>('[data-test-panel="retrieval"] z-accordion-header')
    if (header?.getAttribute('aria-expanded') === 'false') {
      header.click()
      await settle()
    }
    const option = root.querySelector<HTMLElement>(`[data-test-content-scope] [data-content-scope="${value}"]`)
    expect(option).not.toBeNull()
    option.click()
    await settle()
  }

  async function submit(expectedScope?: string) {
    fixture.componentInstance.query.set('quality requirements')
    fixture.componentInstance.test()
    const request = http.expectOne('/api/knowledgebase/kb-1/test')
    expect(request.request.body.contentScope).toBe(expectedScope)
    expect(request.request.body.retrieval.mode).toBe('vector')
    request.flush({ documents: [], diagnostics: [] })
    await settle()
  }

  afterEach(() => {
    http?.verify()
    TestBed.resetTestingModule()
  })

  it('renders the scope inside retrieval settings before the mode controls and defaults to all', async () => {
    await render(true)
    const scope = root.querySelector('[data-test-content-scope]')
    const settings = root.querySelector('[data-test-panel="retrieval"]')
    expect(scope).not.toBeNull()
    expect(scope.closest('z-accordion-item')).toBe(settings)
    expect(root.querySelectorAll('[data-test-controls] z-accordion-item')).toHaveLength(2)
    expect(settings.querySelector('z-accordion-header')?.getAttribute('aria-expanded')).toBe('false')
    const modeControls = settings.querySelector('[data-retrieval-mode]')
    expect(scope.compareDocumentPosition(modeControls) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(scope.querySelectorAll('[z-tab-link]')).toHaveLength(3)
    expect(scope.querySelector('[z-tab-nav-bar]')?.getAttribute('aria-label')).toBe(
      'XP.Knowledgebase.RetrievalContentScope'
    )
    const scopeNav = scope.querySelector('[z-tab-nav-bar]')
    const modeNav = modeControls.closest('[z-tab-nav-bar]')
    expect(scopeNav?.getAttribute('data-z-size')).toBe(modeNav.getAttribute('data-z-size'))
    expect(scopeNav?.getAttribute('data-stretch-tabs')).toBe('true')
    await submit('all')
  })

  it('retains the selection after collapsing and reopening retrieval settings with the keyboard', async () => {
    await render(true)
    await choose('wiki')
    const scope = root.querySelector('[data-test-content-scope]')
    const header = root.querySelector<HTMLElement>('[data-test-panel="retrieval"] z-accordion-header')
    expect(header.getAttribute('aria-expanded')).toBe('true')
    header.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await settle()
    expect(header.getAttribute('aria-expanded')).toBe('false')
    await submit('wiki')
    header.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await settle()
    expect(header.getAttribute('aria-expanded')).toBe('true')
    expect(scope.querySelector('[data-content-scope="wiki"]')?.getAttribute('aria-selected')).toBe('true')
    await choose('original')
    expect(scope.querySelector('[data-content-scope="original"]')?.getAttribute('aria-selected')).toBe('true')
    await submit('original')
  })

  it.each([undefined, false])('hides the selector for disabled or legacy knowledgebases (%s)', async (enabled) => {
    await render(enabled)
    expect(root.querySelector('[data-test-content-scope]')).toBeNull()
    await submit()
  })

  it.each([KnowledgebaseTypeEnum.FAQ, KnowledgebaseTypeEnum.External])(
    'does not expose Wiki scope for %s',
    async (type) => {
      await render(true, type)
      expect(root.querySelector('[data-test-content-scope]')).toBeNull()
    }
  )

  it('sends the chosen scope without saving knowledgebase settings', async () => {
    await render(true)
    await choose('original')
    await submit('original')
    await choose('wiki')
    await submit('wiki')
    await choose('all')
    await submit('all')
    http.expectNone((request) => request.method === 'PUT' || request.method === 'PATCH')
  })

  it('uses temporary mode, recall, fusion and rerank settings without updating the knowledgebase', async () => {
    await render(true)
    await choose('all')
    root.querySelector<HTMLElement>('[data-retrieval-mode="keyword"]').click()
    await settle()
    const editor = fixture.debugElement.query(By.directive(KnowledgeRetrievalSettingsComponent))
      .componentInstance as KnowledgeRetrievalSettingsComponent
    editor.topK.set(4)
    editor.score.set(0.25)
    await settle()
    expect(root.querySelector('[data-action="save"]')).toBeNull()
    expect(root.querySelector('[data-action="cancel"]')).toBeNull()
    const header = root.querySelector<HTMLElement>('[data-test-panel="retrieval"] z-accordion-header')
    header.click()
    await settle()
    fixture.componentInstance.query.set('quality requirements')
    fixture.componentInstance.test()
    const request = http.expectOne('/api/knowledgebase/kb-1/test')
    expect(request.request.body).toMatchObject({
      k: 4,
      score: 0.25,
      retrieval: { mode: 'keyword' },
      rerankModel: null,
      rerankThreshold: null
    })
    expect(knowledgebase().recall).toEqual({ mode: 'vector', topK: 10 })
    request.flush({ documents: [], diagnostics: [] })
    await settle()
    http.expectNone((request) => request.method === 'PUT' || request.method === 'PATCH')
  })

  it('sends an unsaved rerank selection and fusion weights only with the test request', async () => {
    await render(true)
    await choose('all')
    const editor = fixture.debugElement.query(By.directive(KnowledgeRetrievalSettingsComponent))
      .componentInstance as KnowledgeRetrievalSettingsComponent
    editor.mode.set('hybrid')
    editor.rrfEnabled.set(true)
    editor.rrfVectorWeight.set(0.2)
    editor.rrfKeywordWeight.set(0.8)
    editor.rerankModel.set({ modelType: AiModelTypeEnum.RERANK, model: 'rerank-test', copilotId: 'copilot-1' })
    editor.rerankThreshold.set(0.7)
    await settle()
    fixture.componentInstance.test()
    const request = http.expectOne('/api/knowledgebase/kb-1/test')
    expect(request.request.body).toMatchObject({
      rerankModel: { model: 'rerank-test', copilotId: 'copilot-1', modelType: AiModelTypeEnum.RERANK },
      rerankThreshold: 0.7,
      retrieval: { mode: 'hybrid', fusion: { mode: 'weighted_rrf', weights: { vector: 0.2, keyword: 0.8 } } }
    })
    expect(request.request.body.rerankModel).not.toHaveProperty('copilot')
    expect(knowledgebase().rerankModel).toBeUndefined()
    expect(knowledgebase().recall.fusion).toBeUndefined()
    request.flush({ documents: [], diagnostics: [] })
    await settle()
    http.expectNone((request) => request.method === 'PUT' || request.method === 'PATCH')
  })

  it('initializes test content from the saved default and retains an explicit test override', async () => {
    await render(true)
    knowledgebase.update((kb) => ({ ...kb, id: 'kb-2', recall: { ...kb.recall, contentScope: 'original' } }))
    await settle()
    expect(fixture.componentInstance.contentScope()).toBe('original')
    await choose('wiki')
    expect(knowledgebase().recall.contentScope).toBe('original')
  })

  it('supports keyboard selection and disables scope changes while the test is loading', async () => {
    await render(true)
    await choose('all')
    const wiki = root.querySelector<HTMLButtonElement>('[data-content-scope="wiki"]')
    wiki.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await settle()
    expect(wiki.getAttribute('aria-selected')).toBe('true')
    fixture.componentInstance.query.set('quality requirements')
    fixture.componentInstance.test()
    const request = http.expectOne('/api/knowledgebase/kb-1/test')
    await settle()
    for (const option of root.querySelectorAll<HTMLButtonElement>('[data-content-scope]')) {
      expect(option.disabled).toBe(true)
      option.click()
    }
    expect(fixture.componentInstance.contentScope()).toBe('wiki')
    request.flush({ documents: [], diagnostics: [] })
    await settle()
    expect(wiki.disabled).toBe(false)
    await choose('original')
    await submit('original')
  })

  it('resets the temporary scope when switching knowledgebases or disabling Wiki', async () => {
    await render(true)
    await choose('wiki')
    knowledgebase.update((kb) => ({ ...kb, id: 'kb-2' }))
    await settle()
    knowledgebase.update((kb) => ({
      ...kb,
      id: 'kb-1',
      wikiConfig: { enabled: false, extractionGranularity: 'standard' }
    }))
    await settle()
    expect(root.querySelector('[data-test-content-scope]')).toBeNull()
    await submit()
    knowledgebase.update((kb) => ({ ...kb, wikiConfig: { enabled: true, extractionGranularity: 'standard' } }))
    await settle()
    await submit('all')
  })

  it('preserves the selection when recall settings refresh and cannot deselect the active option', async () => {
    await render(true)
    await choose('wiki')
    knowledgebase.update((kb) => ({ ...kb, recall: { ...kb.recall, topK: 20 } }))
    await settle()
    await choose('wiki')
    await submit('wiki')
  })
})
