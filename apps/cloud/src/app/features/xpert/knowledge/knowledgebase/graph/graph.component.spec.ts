import { signal } from '@angular/core'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { provideNoopAnimations } from '@angular/platform-browser/animations'
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
})
