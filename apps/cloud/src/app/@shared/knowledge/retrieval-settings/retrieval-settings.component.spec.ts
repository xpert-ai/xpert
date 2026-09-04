import { By } from '@angular/platform-browser'
import { TestBed } from '@angular/core/testing'
import { GraphRagRetrievalMode, KnowledgebaseService, ToastrService } from '@cloud/app/@core'
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
  options?: { rerankModelId?: string; emptyTemplate?: boolean }
) {
  const knowledgebase = {
    id: 'knowledgebase-1',
    rerankModelId: options?.rerankModelId,
    recall: {
      fusion: {
        mode: fusionMode,
        weights
      }
    },
    graphRag: {
      enabled: true,
      mode
    }
  }
  const knowledgebaseService = {
    update: jest.fn(() => of(knowledgebase))
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

  return { fixture, knowledgebaseService, toastrService }
}

describe('KnowledgeRetrievalSettingsComponent', () => {
  const template = readFileSync(join(__dirname, 'retrieval-settings.component.html'), 'utf8')

  afterEach(() => TestBed.resetTestingModule())

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
    expect(retrieverGrid.nativeElement.classList).toContain('@[560px]/retrieval:auto-cols-fr')
    expect(fixture.debugElement.queryAll(By.css('button[z-tab-link]'))).toHaveLength(4)
    expect(fixture.debugElement.queryAll(By.css('z-slider')).length).toBeGreaterThan(0)
    expect(fixture.debugElement.queryAll(By.css('input[z-input]')).length).toBeGreaterThan(0)
    expect(
      fixture.debugElement.query(By.css('[data-retriever-card="keyword"] [data-retriever-status="active"]'))
    ).not.toBeNull()

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

  it.each([
    ['vector', 'vector'],
    ['keyword', 'keyword'],
    ['graph', 'graph']
  ] as const)(
    'places the shared Top K control inside the active %s retriever in single mode',
    async (mode, retriever) => {
      const { fixture } = await setup({ vector: 0.65, graph: 0.35, keyword: 0.3 }, mode)
      const retrieverCard = fixture.debugElement.query(By.css(`[data-retriever-card="${retriever}"]`))

      expect(retrieverCard.query(By.css('[data-setting="retrieval-top-k"]'))).not.toBeNull()
      expect(fixture.debugElement.query(By.css('[data-top-k-scope="final"]'))).toBeNull()

      fixture.destroy()
    }
  )

  it('renders recall Top K controls above and the final Top K below in hybrid mode', async () => {
    const { fixture } = await setup({ vector: 0.65, graph: 0.35, keyword: 0.3 })
    const recallStage = fixture.debugElement.query(By.css('[data-retrieval-stage="recall"]'))
    const rerankStage = fixture.debugElement.query(By.css('[data-retrieval-stage="rerank"]'))
    const vectorCard = recallStage.query(By.css('[data-retriever-card="vector"]'))
    const keywordCard = recallStage.query(By.css('[data-retriever-card="keyword"]'))
    const graphCard = recallStage.query(By.css('[data-retriever-card="graph"]'))

    expect(fixture.debugElement.queryAll(By.css('[data-setting="retrieval-top-k"]'))).toHaveLength(3)
    expect(vectorCard.query(By.css('[data-top-k-scope="retriever"]'))).not.toBeNull()
    expect(keywordCard.query(By.css('[data-top-k-scope="retriever"]'))).not.toBeNull()
    expect(graphCard.query(By.css('[data-setting="retrieval-top-k"]'))).toBeNull()
    expect(recallStage.query(By.css('.ri-information-line'))).toBeNull()
    expect(rerankStage.query(By.css('[data-top-k-scope="final"]'))).not.toBeNull()

    fixture.destroy()
  })

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

  it.each([
    ['vector', 2],
    ['keyword', 1],
    ['graph', 3],
    ['hybrid', 10]
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

  it('shows Vector and Graph only for legacy hybrid retrieval', async () => {
    const { fixture } = await setup({ vector: 0.65, graph: 0.35, keyword: 0.3 }, 'hybrid', 'legacy')
    const retrieverCards = fixture.debugElement
      .queryAll(By.css('[data-retriever-card]'))
      .map((element) => element.attributes['data-retriever-card'])

    expect(retrieverCards).toEqual(['vector', 'graph'])
    expect(fixture.debugElement.query(By.css('[data-retrieval-stage="fusion"]'))).not.toBeNull()
    expect(fixture.debugElement.query(By.css('[data-rerank-stage-number="3"]'))).not.toBeNull()

    fixture.destroy()
  })

  it('hides zero-weight retrievers from the RRF recall cards', async () => {
    const { fixture } = await setup({ vector: 0.65, graph: 0, keyword: 0.3 })
    const retrieverCards = fixture.debugElement
      .queryAll(By.css('[data-retriever-card]'))
      .map((element) => element.attributes['data-retriever-card'])

    expect(retrieverCards).toEqual(['vector', 'keyword'])
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
    expect(toastrService.error).toHaveBeenCalledWith('XP.Knowledgebase.RRFPositiveWeightRequired', '', {
      Default: 'RRF requires at least one retrieval source with a positive weight.'
    })

    fixture.destroy()
  })
})
