import { signal } from '@angular/core'
import { ComponentFixture, DeferBlockBehavior, TestBed } from '@angular/core/testing'
import { provideNoopAnimations } from '@angular/platform-browser/animations'
import { provideRouter } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import type { IKnowledgebase, KnowledgeWikiPageDetail, KnowledgeWikiStatusResponse } from '@xpert-ai/contracts'
import { of, Subject } from 'rxjs'
import { MarkdownModule } from 'ngx-markdown'
import { KnowledgeWikiService, ToastrService } from '../../../../../@core'
import { KnowledgebaseComponent } from '../knowledgebase.component'
import { KnowledgeWikiComponent } from './wiki.component'
import { WikiGraphComponent } from './wiki-graph.component'

jest.mock('@milkdown/crepe', () => ({ Crepe: jest.fn() }))
jest.mock('mermaid', () => ({ initialize: jest.fn(), render: jest.fn() }))
jest.mock('@xterm/xterm', () => ({ Terminal: jest.fn() }))

const page: KnowledgeWikiPageDetail = {
  id: 'page-A',
  pageKey: 'concept:A',
  pageType: 'concept',
  canonicalName: 'A',
  title: 'Readable page',
  slug: 'a',
  summary: '',
  status: 'ready',
  projectionStatus: 'ready',
  updatedAt: '',
  markdown: '',
  revision: 1,
  aliases: [],
  links: [],
  backlinks: [],
  evidence: []
}
const status: KnowledgeWikiStatusResponse = {
  enabled: true,
  canManage: true,
  status: 'ready',
  availability: 'available',
  readyPageCount: 1,
  requiresManagement: false,
  activeRevision: 1,
  stagedRevision: null,
  generationJobs: { queued: 0, running: 0, failed: 0 },
  pages: { ready: 1, stale: 0, failed: 0, archived: 0, projectionFailed: 0 },
  indeterminateInvocationCount: 0,
  billingRecoveryCount: 0,
  cleanupPendingCount: 0,
  cleanupFailedCount: 0,
  recoveryActions: []
}

describe('Wiki independent loading', () => {
  let fixture: ComponentFixture<KnowledgeWikiComponent>
  let pendingStatus: Subject<KnowledgeWikiStatusResponse>
  const parent = {
    paramId: signal('kb'),
    knowledgebase: signal<Partial<IKnowledgebase> | undefined>({ id: 'kb', wikiConfig: { enabled: true } })
  }
  const service = {
    getClassificationStatus: jest.fn(() => of({ activeJobs: 0 })),
    getStatus: jest.fn(),
    getPages: jest.fn(),
    getPage: jest.fn(),
    getTaxonomy: jest.fn(),
    getGraph: jest.fn()
  }
  beforeEach(async () => {
    jest.clearAllMocks()
    pendingStatus = new Subject()
    parent.paramId.set('kb')
    parent.knowledgebase.set({ id: 'kb', wikiConfig: { enabled: true } })
    service.getStatus.mockReturnValue(pendingStatus)
    service.getPages.mockReturnValue(of({ items: [page], total: 1 }))
    service.getPage.mockReturnValue(of(page))
    service.getTaxonomy.mockReturnValue(
      of({ enabled: false, revision: 0, folders: [], total: 1, unclassifiedCount: 1 })
    )
    service.getGraph.mockReturnValue(of({ nodes: [], edges: [], truncated: false }))
    await TestBed.configureTestingModule({
      imports: [KnowledgeWikiComponent, TranslateModule.forRoot(), MarkdownModule.forRoot()],
      deferBlockBehavior: DeferBlockBehavior.Playthrough,
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: KnowledgeWikiService, useValue: service },
        { provide: KnowledgebaseComponent, useValue: parent },
        { provide: ToastrService, useValue: { danger: jest.fn() } }
      ]
    })
      .overrideComponent(WikiGraphComponent, { set: { template: '' } })
      .compileComponents()
    fixture = TestBed.createComponent(KnowledgeWikiComponent)
  })
  afterEach(() => {
    fixture.destroy()
    TestBed.resetTestingModule()
  })
  async function render() {
    fixture.autoDetectChanges()
    // Synchronous mock observables still continue through native async/await microtasks.
    await new Promise((resolve) => setTimeout(resolve, 0))
    await fixture.whenStable()
    fixture.detectChanges()
    return fixture.nativeElement as HTMLElement
  }

  it('reads pages and folders before management status completes, without loading the graph', async () => {
    const root = await render()
    expect(root.querySelector('article')?.textContent).toContain('Readable page')
    expect(service.getTaxonomy).toHaveBeenCalledTimes(1)
    expect(service.getGraph).not.toHaveBeenCalled()
    expect(root.querySelector('xp-wiki-graph')).toBeNull()
    expect(fixture.componentInstance.canManage()).toBe(false)
    pendingStatus.next(status)
    await render()
    expect(fixture.componentInstance.canManage()).toBe(true)
    expect(service.getPages).toHaveBeenCalledTimes(1)
    expect(service.getPage).toHaveBeenCalledTimes(1)
  })

  it('shows a skeleton while configuration is unknown instead of claiming Wiki is disabled', async () => {
    parent.knowledgebase.set(undefined)
    const root = await render()
    expect(root.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(root.textContent).not.toContain('DisabledTitle')
    expect(root.textContent).not.toContain('SelectPage')
    expect(service.getPages).not.toHaveBeenCalled()
    parent.knowledgebase.set({ id: 'kb', wikiConfig: { enabled: true } })
    await render()
    expect(root.querySelector('article')).not.toBeNull()
  })

  it('resizes the directory and retains its width after visiting the full-width graph', async () => {
    const root = await render()
    const container = root.querySelector<HTMLElement>('[z-resizable]')
    const handle = root.querySelector<HTMLElement>('[role="separator"]')
    const directory = root.querySelector('aside')?.parentElement
    const content = root.querySelector('main')?.parentElement
    if (!container || !handle || !directory || !content) throw new Error('Wiki split layout is missing')
    Object.defineProperty(container, 'offsetWidth', { configurable: true, value: 1200 })

    handle.dispatchEvent(new MouseEvent('mousedown', { clientX: 240, bubbles: true }))
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 360 }))
    document.dispatchEvent(new MouseEvent('mouseup'))
    await render()
    expect(directory.style.width).toBe('30%')
    expect(content.style.width).toBe('70%')
    expect(root.querySelector('article')?.textContent).toContain('Readable page')
    expect(service.getGraph).not.toHaveBeenCalled()

    await fixture.componentInstance.setView('graph')
    await render()
    expect(directory.classList.contains('hidden')).toBe(true)
    expect(handle.classList.contains('hidden')).toBe(true)
    expect(content.classList.contains('!w-full')).toBe(true)

    await fixture.componentInstance.setView('read')
    await render()
    expect(directory.classList.contains('hidden')).toBe(false)
    expect(handle.classList.contains('hidden')).toBe(false)
    expect(content.classList.contains('!w-full')).toBe(false)
    expect(directory.style.width).toBe('30%')
  })

  it('keeps a skeleton until the first list and selected body arrive', async () => {
    const pages = new Subject<{ items: KnowledgeWikiPageDetail[]; total: number }>()
    const body = new Subject<KnowledgeWikiPageDetail>()
    service.getPages.mockReturnValue(pages)
    service.getPage.mockReturnValue(body)
    const root = await render()
    expect(root.querySelector('main [role="status"]')).not.toBeNull()
    expect(root.textContent).not.toContain('SelectPage')
    pages.next({ items: [page], total: 1 })
    await render()
    expect(root.querySelector('main [role="status"]')).not.toBeNull()
    body.next(page)
    await render()
    expect(root.querySelector('article')?.textContent).toContain('Readable page')
  })

  it('keeps reading usable when management status fails', async () => {
    const root = await render()
    pendingStatus.error(new Error('status unavailable'))
    await render()
    expect(root.querySelector('article')?.textContent).toContain('Readable page')
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('status unavailable')
    expect(fixture.componentInstance.canManage()).toBe(false)
    service.getStatus.mockReturnValue(of(status))
    await fixture.componentInstance.loadStatus()
    await render()
    expect(root.querySelector('[role="alert"]')).toBeNull()
    expect(service.getPages).toHaveBeenCalledTimes(1)
    expect(service.getPage).toHaveBeenCalledTimes(1)
  })

  it('shows disabled only after an explicit result and ignores pending reading responses', async () => {
    const pages = new Subject<{ items: KnowledgeWikiPageDetail[]; total: number }>()
    service.getPages.mockReturnValue(pages)
    const root = await render()
    expect(root.textContent).not.toContain('DisabledTitle')
    pendingStatus.next({ ...status, enabled: false })
    await render()
    expect(root.textContent).toContain('DisabledTitle')
    pages.next({ items: [page], total: 1 })
    await render()
    expect(service.getPage).not.toHaveBeenCalled()
    expect(root.querySelector('article')).toBeNull()
  })

  it('does not reuse a previous knowledgebase configuration, status, or selected page', async () => {
    await render()
    service.getStatus.mockReturnValue(new Subject<KnowledgeWikiStatusResponse>())
    parent.paramId.set('other-kb')
    const root = await render()
    pendingStatus.next(status)
    await render()
    // The new request is pending independently of the old response.
    expect(service.getPages).not.toHaveBeenCalledWith('other-kb', expect.anything())
    expect(root.querySelector('article')).toBeNull()
    expect(fixture.componentInstance.canManage()).toBe(false)
  })

  it('loads the graph on selection and returns to reading without further graph requests', async () => {
    await render()
    await fixture.componentInstance.setView('graph')
    let root = await render()
    expect(root.querySelector('xp-wiki-graph')).not.toBeNull()
    expect(service.getGraph).toHaveBeenCalledTimes(1)
    await fixture.componentInstance.setView('read')
    root = await render()
    parent.paramId.set('other-kb')
    parent.knowledgebase.set({ id: 'other-kb', wikiConfig: { enabled: true } })
    await render()
    expect(service.getGraph).toHaveBeenCalledTimes(1)
    expect(root.querySelector('article')).not.toBeNull()
  })
})
