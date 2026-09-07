import { By } from '@angular/platform-browser'
import { TestBed } from '@angular/core/testing'
import { GraphRagRetrievalMode, IKnowledgebase, KnowledgebaseService, ToastrService } from '@cloud/app/@core'
import { TranslateModule } from '@ngx-translate/core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { of } from 'rxjs'
import { KnowledgeRetrievalSettingsComponent } from './retrieval-settings.component'

async function setup(
  weights: { vector: number; graph: number; keyword: number },
  mode: GraphRagRetrievalMode = 'hybrid',
  fusionMode: 'legacy' | 'weighted_rrf' = 'weighted_rrf',
  options?: { rerankModelId?: string; rerankThreshold?: number; emptyTemplate?: boolean; graphEnabled?: boolean }
) {
  const knowledgebase = {
    id: 'knowledgebase-1',
    rerankModelId: options?.rerankModelId,
    recall: {
      rerankThreshold: options?.rerankThreshold,
      fusion: {
        mode: fusionMode,
        weights
      }
    },
    graphRag: {
      enabled: options?.graphEnabled ?? true,
      mode
    }
  }
  const knowledgebaseService = {
    update: jest.fn((_id: string, _payload: Partial<IKnowledgebase>) => of(knowledgebase))
  }
  const toastrService = {
    error: jest.fn()
  }

  TestBed.resetTestingModule()
  const testingModule = TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot(), KnowledgeRetrievalSettingsComponent],
    providers: [
      { provide: KnowledgebaseService, useValue: knowledgebaseService },
      { provide: ToastrService, useValue: toastrService }
    ]
  })
  if (options?.emptyTemplate) {
    testingModule.overrideComponent(KnowledgeRetrievalSettingsComponent, { set: { template: '' } })
  }
  await testingModule.compileComponents()

  const fixture = TestBed.createComponent(KnowledgeRetrievalSettingsComponent)
  fixture.componentRef.setInput('savable', true)
  const cva = fixture.debugElement.injector.get(NgxControlValueAccessor)
  cva.value$.set(knowledgebase)
  fixture.detectChanges()
  TestBed.flushEffects()
  fixture.detectChanges()
  await fixture.whenStable()
  fixture.detectChanges()

  return { fixture, knowledgebaseService, toastrService }
}

describe('KnowledgeRetrievalSettingsComponent', () => {
  const template = readFileSync(join(__dirname, 'retrieval-settings.component.html'), 'utf8')

  afterEach(() => TestBed.resetTestingModule())

  it.each(['graph', 'hybrid'] as const)(
    'blocks Wiki-only %s retrieval without a Wiki-compatible source',
    async (mode) => {
      const { fixture, knowledgebaseService } = await setup({ vector: 0, graph: 1, keyword: 0 }, mode)
      fixture.componentRef.setInput('showContentScope', true)
      fixture.componentInstance.contentScope.set('wiki')
      fixture.detectChanges()
      expect(fixture.componentInstance.graphRetrieverActive()).toBe(false)
      expect(fixture.componentInstance.rrfHasEnabledRetriever()).toBe(false)
      fixture.componentInstance.saveRetrievalSettings()
      expect(knowledgebaseService.update).not.toHaveBeenCalled()
    }
  )

  it('clears the FAQ rerank threshold explicitly across request serialization', async () => {
    const { fixture, knowledgebaseService } = await setup({ vector: 1, graph: 0, keyword: 0 }, 'vector', 'legacy', {
      rerankModelId: 'saved-model',
      rerankThreshold: 0.6,
      emptyTemplate: true
    })
    fixture.componentRef.setInput('allowGraphRetrieval', false)
    fixture.componentInstance.useRerankThreshold.set(false)
    fixture.detectChanges()
    fixture.componentInstance.saveRetrievalSettings()
    const payload = knowledgebaseService.update.mock.calls[0]?.[1]
    expect(JSON.parse(JSON.stringify(payload)).recall.rerankThreshold).toBeNull()
  })

  it('switches graph mode to vector when Wiki-only content is selected and prevents selecting graph', async () => {
    const { fixture } = await setup({ vector: 1, graph: 1, keyword: 0 }, 'graph')
    fixture.componentRef.setInput('showContentScope', true)
    fixture.detectChanges()
    fixture.debugElement.query(By.css('[data-content-scope="wiki"]')).nativeElement.click()
    fixture.detectChanges()
    expect(fixture.componentInstance.mode()).toBe('vector')
    fixture.debugElement.query(By.css('[data-retrieval-mode="graph"]')).nativeElement.click()
    fixture.detectChanges()
    expect(fixture.componentInstance.mode()).toBe('vector')
    expect(fixture.componentInstance.rrfHasEnabledRetriever()).toBe(true)
  })

  it('rejects graph-only retrieval when graph indexing is disabled', async () => {
    const { fixture, knowledgebaseService } = await setup({ vector: 0, graph: 1, keyword: 0 }, 'graph', 'legacy', {
      graphEnabled: false
    })
    expect(fixture.componentInstance.graphRetrieverActive()).toBe(false)
    expect(fixture.componentInstance.rrfHasEnabledRetriever()).toBe(false)
    fixture.componentInstance.saveRetrievalSettings()
    expect(knowledgebaseService.update).not.toHaveBeenCalled()
  })

  it('rejects RRF with only an unavailable graph source', async () => {
    const { fixture } = await setup({ vector: 0, graph: 1, keyword: 0 }, 'hybrid', 'weighted_rrf', {
      graphEnabled: false
    })
    expect(fixture.componentInstance.rrfHasEnabledRetriever()).toBe(false)
  })

  it('does not select the disabled graph tab through a native click', async () => {
    const { fixture } = await setup({ vector: 1, graph: 0, keyword: 0 }, 'vector', 'legacy', { graphEnabled: false })
    fixture.debugElement.query(By.css('[data-retrieval-mode="graph"]')).nativeElement.click()
    fixture.detectChanges()
    expect(fixture.componentInstance.mode()).toBe('vector')
  })

  it('keeps an empty weight editable and blocks saving instead of restoring a hidden default', async () => {
    const { fixture, knowledgebaseService } = await setup({ vector: 1, graph: 0, keyword: 0 })
    const input: HTMLInputElement = fixture.debugElement.query(
      By.css('[data-setting="rrf-vector-weight"] input')
    ).nativeElement
    input.value = ''
    input.dispatchEvent(new Event('input', { bubbles: true }))
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    expect(fixture.componentInstance.vectorRetrieverActive()).toBe(false)
    expect(fixture.componentInstance.rrfHasEnabledRetriever()).toBe(false)
    expect(fixture.debugElement.query(By.css('[data-setting="rrf-vector-weight"] input'))).not.toBeNull()
    fixture.componentInstance.saveRetrievalSettings()
    expect(knowledgebaseService.update).not.toHaveBeenCalled()
  })

  it('keeps inactive sources visible so they can be selected without changing fusion', async () => {
    const { fixture } = await setup({ vector: 1, graph: 0, keyword: 0 })
    expect(fixture.debugElement.queryAll(By.css('[data-retriever-card]'))).toHaveLength(3)
    expect(fixture.debugElement.query(By.css('[data-retriever-card="keyword"] z-checkbox'))).not.toBeNull()
  })

  it('shows keyword eligibility in legacy hybrid instead of hiding the source', async () => {
    const { fixture } = await setup({ vector: 1, graph: 0.35, keyword: 0.3 }, 'hybrid', 'legacy')
    expect(fixture.debugElement.query(By.css('[data-retriever-card="keyword"]'))).not.toBeNull()
    expect(fixture.componentInstance.keywordRetrieverActive()).toBe(false)
  })

  it('renders the shared result limit only once in hybrid mode', async () => {
    const { fixture } = await setup({ vector: 1, graph: 1, keyword: 1 })
    expect(fixture.debugElement.queryAll(By.css('[data-setting="retrieval-top-k"]'))).toHaveLength(1)
  })

  it('allows the vector similarity threshold before RRF fusion', async () => {
    const { fixture } = await setup({ vector: 1, graph: 1, keyword: 1 })
    const threshold = fixture.debugElement.query(By.css('[data-setting="similarity-threshold"] z-switch'))
    expect(threshold.componentInstance.disabled()).toBe(false)
  })

  it('saves the selected mode while preserving graph indexing and legacy fusion', async () => {
    const { fixture, knowledgebaseService } = await setup({ vector: 1, graph: 0.35, keyword: 0.3 }, 'vector', 'legacy')
    fixture.debugElement.query(By.css('[data-retrieval-mode="keyword"]')).triggerEventHandler('click')
    fixture.detectChanges()
    expect(knowledgebaseService.update).not.toHaveBeenCalled()
    fixture.componentInstance.saveRetrievalSettings()
    expect(knowledgebaseService.update).toHaveBeenCalledWith(
      'knowledgebase-1',
      expect.objectContaining({
        recall: expect.objectContaining({ mode: 'keyword', fusion: expect.objectContaining({ mode: 'legacy' }) }),
        graphRag: expect.objectContaining({ enabled: true })
      })
    )
  })

  it('changes hybrid participation without toggling graph indexing and restores its weight', async () => {
    const { fixture } = await setup({ vector: 0.65, graph: 0.8, keyword: 0 })
    const component = fixture.componentInstance
    const graphCheckbox = fixture.debugElement.query(By.css('[data-retriever-card="graph"] z-checkbox input'))
    expect(component.rrfGraphWeight()).toBe(0.8)
    expect(graphCheckbox.nativeElement.checked).toBe(true)
    graphCheckbox.nativeElement.click()
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    expect(component.graphEnabled()).toBe(true)
    expect(component.rrfGraphWeight()).toBe(0)
    graphCheckbox.nativeElement.click()
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    expect(component.rrfGraphWeight()).toBe(0.8)
    expect(component.graphEnabled()).toBe(true)
  })

  it('does not change the persisted settings when cancelled', async () => {
    const { fixture, knowledgebaseService } = await setup({ vector: 1, graph: 0, keyword: 0 })
    fixture.componentInstance.mode.set('keyword')
    fixture.detectChanges()
    fixture.componentInstance.cancel()
    expect(knowledgebaseService.update).not.toHaveBeenCalled()
  })

  it('shows the mode tabs without a redundant retrieval mode introduction', () => {
    expect(template).not.toContain('RetrievalModeDesc')
  })

  it('hides the legacy graph weight while weighted RRF is active', async () => {
    const { fixture } = await setup({ vector: 0.65, graph: 0.35, keyword: 0.3 })

    expect(fixture.componentInstance.rrfActive()).toBe(true)
    expect(fixture.debugElement.query(By.css('[data-setting="legacy-graph-weight"]'))).toBeNull()
    expect(fixture.debugElement.query(By.css('[data-setting="rrf-graph-weight"]'))).not.toBeNull()

    fixture.destroy()
  })

  it('renders the three retrieval stages and retriever cards with Zard controls', async () => {
    const { fixture } = await setup({ vector: 0.65, graph: 0.35, keyword: 0.3 })
    const retrieverGrid = fixture.debugElement.query(By.css('[data-retriever-grid]'))

    expect(fixture.debugElement.queryAll(By.css('[data-retrieval-stage]'))).toHaveLength(3)
    expect(fixture.debugElement.queryAll(By.css('[data-retriever-card]'))).toHaveLength(3)
    expect(retrieverGrid.nativeElement.classList).toContain('@[560px]/retrieval:grid-flow-col')
    expect(fixture.debugElement.queryAll(By.css('button[z-tab-link]'))).toHaveLength(4)
    expect(fixture.debugElement.queryAll(By.css('z-slider')).length).toBeGreaterThan(0)
    expect(fixture.debugElement.queryAll(By.css('input[z-input]')).length).toBeGreaterThan(0)
    expect(
      fixture.debugElement.query(By.css('[data-retriever-card="keyword"] [data-retriever-status="active"]'))
    ).not.toBeNull()

    fixture.destroy()
  })

  it('limits FAQ retrieval to vector, keyword, and their hybrid without rendering graph controls', async () => {
    const { fixture } = await setup({ vector: 0.7, graph: 0.3, keyword: 0.3 })
    fixture.componentRef.setInput('allowGraphRetrieval', false)
    fixture.componentRef.setInput('defaultMode', 'hybrid')
    fixture.detectChanges()

    const retrievalModes = fixture.debugElement
      .queryAll(By.css('[data-retrieval-mode]'))
      .map((element) => element.attributes['data-retrieval-mode'])

    expect(retrievalModes).toEqual(['vector', 'keyword', 'hybrid'])
    expect(fixture.debugElement.query(By.css('[data-retrieval-mode="graph"]'))).toBeNull()
    expect(fixture.debugElement.query(By.css('[data-retriever-card="graph"]'))).toBeNull()
    expect(fixture.debugElement.query(By.css('[data-setting="rrf-graph-weight"]'))).toBeNull()
    expect(fixture.debugElement.query(By.css('[data-setting="legacy-graph-weight"]'))).toBeNull()
    expect(fixture.componentInstance.rrfActive()).toBe(true)

    fixture.destroy()
  })

  it('switches to keyword-only retrieval from the keyword mode tab', async () => {
    const { fixture } = await setup({ vector: 0.65, graph: 0.35, keyword: 0.3 })
    const keywordMode = fixture.debugElement.query(By.css('[data-retrieval-mode="keyword"]'))

    expect(keywordMode).not.toBeNull()
    keywordMode.triggerEventHandler('click')
    fixture.detectChanges()

    expect(fixture.componentInstance.mode()).toBe('keyword')
    expect(
      fixture.debugElement.query(By.css('[data-retriever-card="keyword"] [data-retriever-status="active"]'))
    ).not.toBeNull()
    expect(fixture.debugElement.query(By.css('[data-retriever-card="vector"]'))).toBeNull()
    expect(fixture.debugElement.query(By.css('[data-retriever-card="graph"]'))).toBeNull()

    fixture.destroy()
  })

  it.each([
    ['vector', 'vector'],
    ['keyword', 'keyword'],
    ['graph', 'graph']
  ] as const)('shows only the participating %s retriever in single mode', async (mode, expectedRetriever) => {
    const { fixture } = await setup({ vector: 0.65, graph: 0.35, keyword: 0.3 }, mode)
    const retrieverCards = fixture.debugElement.queryAll(By.css('[data-retriever-card]'))

    expect(retrieverCards).toHaveLength(1)
    expect(retrieverCards[0].attributes['data-retriever-card']).toBe(expectedRetriever)
    expect(fixture.debugElement.query(By.css('[data-retrieval-stage="fusion"]'))).toBeNull()
    expect(fixture.debugElement.query(By.css('[data-rerank-stage-number="2"]'))).not.toBeNull()

    fixture.destroy()
  })

  it.each(['vector', 'keyword', 'graph', 'hybrid'] as const)(
    'uses one shared result limit in %s mode',
    async (mode) => {
      const { fixture } = await setup({ vector: 0.65, graph: 0.35, keyword: 0.3 }, mode)
      expect(fixture.debugElement.queryAll(By.css('[data-setting="retrieval-top-k"]'))).toHaveLength(1)
      expect(fixture.debugElement.query(By.css('[data-top-k-scope="shared"]'))).not.toBeNull()
      fixture.destroy()
    }
  )

  it('does not show the redundant keyword availability notice', async () => {
    const { fixture } = await setup({ vector: 0.65, graph: 0.35, keyword: 0.3 }, 'keyword')
    const keywordCard = fixture.debugElement.query(By.css('[data-retriever-card="keyword"]'))

    expect(keywordCard.query(By.css('.ri-information-line'))).toBeNull()

    fixture.destroy()
  })

  it('preserves an existing rerank model id until reranking is disabled', async () => {
    const { fixture } = await setup({ vector: 0.65, graph: 0.35, keyword: 0.3 }, 'hybrid', 'weighted_rrf', {
      rerankModelId: 'rerank-model-1',
      emptyTemplate: true
    })
    const component = fixture.componentInstance

    expect(component.useRerank()).toBe(true)

    component.useRerank.set(false)
    fixture.detectChanges()

    expect(component.knowledgebase().rerankModelId).toBeNull()
    fixture.destroy()
  })

  it('edits and saves the optional rerank threshold with the rerank model', async () => {
    const { fixture, knowledgebaseService } = await setup(
      { vector: 0.65, graph: 0.35, keyword: 0.3 },
      'hybrid',
      'weighted_rrf',
      { rerankModelId: 'rerank-model-1', rerankThreshold: 0.6, emptyTemplate: true }
    )
    const component = fixture.componentInstance

    expect(component.useRerankThreshold()).toBe(true)
    expect(template).toContain('data-setting="rerank-threshold"')

    component.rerankThreshold.set(0.75)
    await fixture.whenStable()
    fixture.detectChanges()
    component.saveRetrievalSettings()

    expect(knowledgebaseService.update).toHaveBeenCalledWith(
      'knowledgebase-1',
      expect.objectContaining({ recall: expect.objectContaining({ rerankThreshold: 0.75 }) })
    )
    fixture.destroy()
  })

  it.each([
    ['vector', 2],
    ['keyword', 1],
    ['graph', 3],
    ['hybrid', 8]
  ] as const)('places every %s numeric input after its slider', async (mode, expectedControlCount) => {
    const { fixture } = await setup({ vector: 0.65, graph: 0.35, keyword: 0.3 }, mode)
    const controls = fixture.debugElement.queryAll(By.css('[data-slider-input]'))

    expect(controls).toHaveLength(expectedControlCount)
    controls.forEach((control) => {
      expect(control.children).toHaveLength(2)
      expect(control.children[0].name).toBe('z-slider')
      expect(control.children[1].name).toBe('input')
    })

    fixture.destroy()
  })

  it('keeps legacy hybrid sources explicit without changing its fusion configuration', async () => {
    const { fixture } = await setup({ vector: 0.65, graph: 0.35, keyword: 0.3 }, 'hybrid', 'legacy')
    const retrieverCards = fixture.debugElement
      .queryAll(By.css('[data-retriever-card]'))
      .map((element) => element.attributes['data-retriever-card'])

    expect(retrieverCards).toEqual(['vector', 'keyword', 'graph'])
    expect(fixture.componentInstance.fusion().mode).toBe('legacy')
    expect(fixture.componentInstance.keywordRetrieverActive()).toBe(false)
    expect(fixture.debugElement.query(By.css('[data-retrieval-stage="fusion"]'))).not.toBeNull()
    expect(fixture.debugElement.query(By.css('[data-rerank-stage-number="3"]'))).not.toBeNull()

    fixture.destroy()
  })

  it('keeps zero-weight retrievers available for selection', async () => {
    const { fixture } = await setup({ vector: 0.65, graph: 0, keyword: 0.3 })
    const retrieverCards = fixture.debugElement
      .queryAll(By.css('[data-retriever-card]'))
      .map((element) => element.attributes['data-retriever-card'])

    expect(retrieverCards).toEqual(['vector', 'keyword', 'graph'])
    expect(fixture.componentInstance.graphRetrieverActive()).toBe(false)
    expect(fixture.debugElement.query(By.css('[data-retrieval-stage="fusion"]'))).not.toBeNull()

    fixture.destroy()
  })

  it('blocks saving and displays a warning when all RRF weights are zero', async () => {
    const { fixture, knowledgebaseService, toastrService } = await setup({ vector: 0, graph: 0, keyword: 0 })
    const component = fixture.componentInstance

    expect(component.rrfHasEnabledRetriever()).toBe(false)
    expect(fixture.debugElement.query(By.css('.ri-error-warning-line'))).not.toBeNull()
    expect(fixture.debugElement.query(By.css('[data-action="save"]')).nativeElement.disabled).toBe(true)

    component.saveRetrievalSettings()

    expect(knowledgebaseService.update).not.toHaveBeenCalled()
    expect(toastrService.error).toHaveBeenCalledWith('XP.Knowledgebase.RetrievalSourceRequired', '', {
      Default: 'Select at least one available retrieval source with a positive weight.'
    })

    fixture.destroy()
  })
})
