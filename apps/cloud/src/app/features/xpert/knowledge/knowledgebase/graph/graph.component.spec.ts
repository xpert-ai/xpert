import { signal } from '@angular/core'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { provideNoopAnimations } from '@angular/platform-browser/animations'
import { By } from '@angular/platform-browser'
import { ZardComboboxComponent } from '@xpert-ai/headless-ui'
import { TranslateModule } from '@ngx-translate/core'
import { of } from 'rxjs'
import { KnowledgebaseService, KnowledgeGraphStatus, ToastrService } from '../../../../../@core'
import { KnowledgebaseComponent } from '../knowledgebase.component'
import { KnowledgeGraphComponent } from './graph.component'

jest.mock('../knowledgebase.component', () => ({ KnowledgebaseComponent: class {} }))

describe('KnowledgeGraphComponent settings and indexing', () => {
  let fixture: ComponentFixture<KnowledgeGraphComponent>
  const parent = {
    knowledgebase: signal({ id: 'kb-1', graphRag: { enabled: false } }),
    openConfiguration: jest.fn(),
    refresh: jest.fn()
  }
  const service = {
    getGraphStatus: jest.fn(),
    getGraphCatalog: jest.fn(() => of({ sources: [], entities: [], hiddenNodes: 0, hiddenRelations: 0 })),
    getGraphVisualization: jest.fn(() => of({ nodes: [], edges: [] })),
    getGraphRelations: jest.fn(() => of({ items: [] })),
    getGraphEntities: jest.fn(() => of({ items: [] })),
    rebuildGraph: jest.fn(() => of([]))
  }

  beforeEach(async () => {
    parent.knowledgebase.set({ id: 'kb-1', graphRag: { enabled: false } })
    service.getGraphStatus.mockImplementation(() =>
      of({
        enabled: parent.knowledgebase().graphRag.enabled,
        status: parent.knowledgebase().graphRag.enabled
          ? KnowledgeGraphStatus.REBUILD_REQUIRED
          : KnowledgeGraphStatus.DISABLED
      })
    )
    await TestBed.configureTestingModule({
      imports: [KnowledgeGraphComponent, TranslateModule.forRoot()],
      providers: [
        provideNoopAnimations(),
        { provide: KnowledgebaseComponent, useValue: parent },
        { provide: KnowledgebaseService, useValue: service },
        { provide: ToastrService, useValue: { error: jest.fn(), success: jest.fn() } }
      ]
    }).compileComponents()
    fixture = TestBed.createComponent(KnowledgeGraphComponent)
    await settle()
  })

  async function settle() {
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
  }

  afterEach(() => {
    fixture.destroy()
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('opens model settings from the gear and basic settings from the disabled state', () => {
    const root = fixture.nativeElement as HTMLElement
    root.querySelector<HTMLButtonElement>('button[title="XP.Knowledgebase.OpenConfiguration"]')!.click()
    expect(parent.openConfiguration).toHaveBeenCalledWith('models')

    root.querySelector<HTMLButtonElement>('z-empty button')!.click()
    expect(parent.openConfiguration).toHaveBeenCalledWith('basic')
    expect(root.querySelector('a[href*="configuration"]')).toBeNull()
  })

  it('refreshes graph availability when settings enable graph indexing in the same knowledgebase', async () => {
    expect(fixture.componentInstance.disabled()).toBe(true)
    parent.knowledgebase.set({ id: 'kb-1', graphRag: { enabled: true } })
    await settle()

    expect(service.getGraphStatus).toHaveBeenCalledTimes(2)
    expect(fixture.componentInstance.disabled()).toBe(false)
    expect(fixture.nativeElement.textContent).toContain('XP.Knowledgebase.GraphRebuildRequiredHelp')
    expect(service.rebuildGraph).not.toHaveBeenCalled()
  })

  it('requests all nodes in the selected source and keeps hidden visibility explicit', async () => {
    parent.knowledgebase.set({ id: 'kb-1', graphRag: { enabled: true } })
    await settle()
    fixture.componentInstance.sourceDocumentId.set('revision-document')
    fixture.componentInstance.includeHidden.set(true)
    await fixture.componentInstance.loadAllNodes()
    expect(service.getGraphVisualization).toHaveBeenLastCalledWith(
      'kb-1',
      expect.objectContaining({
        sourceDocumentId: 'revision-document',
        includeHidden: true,
        loadAll: true
      })
    )
    await fixture.componentInstance.clearFilters()
    expect(service.getGraphVisualization).toHaveBeenLastCalledWith(
      'kb-1',
      expect.objectContaining({
        sourceDocumentId: null,
        includeHidden: false,
        loadAll: false,
        visibleEntityIds: [],
        expandedEntityIds: []
      })
    )
  })

  it('appends neighbors using the current visible IDs instead of replacing the focus', async () => {
    parent.knowledgebase.set({ id: 'kb-1', graphRag: { enabled: true } })
    await settle()
    await fixture.componentInstance.loadGraph()
    fixture.componentInstance.view.set({
      nodes: [{ id: 'part', name: 'Part', type: 'component', origin: 'structured', visibility: 'active' }],
      edges: [],
      entityTypes: [],
      relationTypes: [],
      totalNodes: 2,
      totalEdges: 1
    })
    fixture.componentInstance.selectedEntity.set({
      id: 'part',
      name: 'Part',
      type: 'component',
      normalizedName: 'part'
    })
    fixture.componentInstance.focusEntityId.set('root')
    await fixture.componentInstance.exploreSelectedEntity()
    expect(service.getGraphVisualization).toHaveBeenLastCalledWith(
      'kb-1',
      expect.objectContaining({
        focusEntityId: 'root',
        visibleEntityIds: ['part'],
        expandedEntityIds: ['part']
      })
    )
  })

  it('renders searchable source and focus controls and an unmistakable selected tab with keyboard support', async () => {
    const root: HTMLElement = fixture.nativeElement
    expect(root.querySelectorAll('z-combobox button[aria-autocomplete="list"]')).toHaveLength(2)
    let selected = root.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')
    expect(selected.textContent).toContain('XP.Knowledgebase.GraphOverview')
    expect(selected.classList.contains('shadow-sm')).toBe(true)
    selected.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await settle()
    selected = root.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')
    expect(selected.textContent).toContain('XP.Knowledgebase.Entities')
    expect(selected.tabIndex).toBe(0)
    expect(selected.classList.contains('bg-components-card-bg')).toBe(true)
  })

  it('clears the source via its button, resets its focus, and removes the old visible label', async () => {
    parent.knowledgebase.set({ id: 'kb-1', graphRag: { enabled: true } })
    await settle()
    await fixture.componentInstance.loadGraph()
    fixture.componentInstance.sources.set([{ id: 'source-a', name: 'Test BOM R5' }])
    await settle()
    const combo: ZardComboboxComponent = fixture.debugElement.query(
      By.directive(ZardComboboxComponent)
    ).componentInstance
    combo.handleSelect({ value: 'source-a', label: 'Test BOM R5' })
    fixture.componentInstance.focusEntityId.set('root-a')
    fixture.componentInstance.relationType.set('contains')
    fixture.detectChanges()
    const root: HTMLElement = fixture.nativeElement
    root.querySelector<HTMLButtonElement>('[aria-label="XP.Knowledgebase.ClearGraphSourceSelection"]').click()
    await settle()

    expect(fixture.componentInstance.sourceDocumentId()).toBe('')
    expect(fixture.componentInstance.focusEntityId()).toBe('')
    expect(fixture.componentInstance.relationType()).toBe('contains')
    expect(service.getGraphVisualization).toHaveBeenLastCalledWith(
      'kb-1',
      expect.objectContaining({
        sourceDocumentId: null,
        focusEntityId: null,
        relationType: 'contains'
      })
    )
    expect(root.querySelector('z-combobox').textContent).not.toContain('Test BOM R5')
    expect(root.querySelector('z-combobox').textContent).toContain('XP.Knowledgebase.GraphSourceScope')
    expect(root.querySelector('[aria-label="XP.Knowledgebase.ClearGraphSourceSelection"]')).toBeNull()
  })

  it('clears only the focus when its own clear button is clicked', async () => {
    parent.knowledgebase.set({ id: 'kb-1', graphRag: { enabled: true } })
    await settle()
    await fixture.componentInstance.loadGraph()
    fixture.componentInstance.sourceDocumentId.set('source-a')
    fixture.componentInstance.focusEntityId.set('root-a')
    fixture.detectChanges()
    const root: HTMLElement = fixture.nativeElement
    root.querySelector<HTMLButtonElement>('[aria-label="XP.Knowledgebase.ClearGraphFocusSelection"]').click()
    await settle()
    expect(service.getGraphVisualization).toHaveBeenLastCalledWith(
      'kb-1',
      expect.objectContaining({
        sourceDocumentId: 'source-a',
        focusEntityId: null
      })
    )
    expect(root.querySelector('[aria-label="XP.Knowledgebase.ClearGraphFocusSelection"]')).toBeNull()
  })
})
