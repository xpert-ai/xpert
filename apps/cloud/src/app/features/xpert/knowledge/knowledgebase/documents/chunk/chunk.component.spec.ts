import { Dialog } from '@angular/cdk/dialog'
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http'
import { signal } from '@angular/core'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'
import { provideNoopAnimations } from '@angular/platform-browser/animations'
import { ActivatedRoute, provideRouter } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { BehaviorSubject, of, Subject } from 'rxjs'
import { IKnowledgebase } from '@xpert-ai/contracts'
import {
  IKnowledgeDocument,
  IKnowledgeDocumentChunk,
  KnowledgeDocumentService,
  ToastrService
} from '../../../../../../@core'
import { KnowledgebaseComponent } from '../../knowledgebase.component'
import { KnowledgeDocumentChunkComponent } from './chunk.component'
import { KnowledgeChunkComponent } from '@cloud/app/@shared/knowledge'

jest.mock('@milkdown/crepe', () => ({ Crepe: jest.fn() }))
jest.mock('mermaid', () => ({ initialize: jest.fn(), render: jest.fn() }))
jest.mock('@xterm/xterm', () => ({ Terminal: jest.fn() }))

describe('Document chunk page loading failures', () => {
  let fixture: ComponentFixture<KnowledgeDocumentChunkComponent>
  let detail: Subject<IKnowledgeDocument>
  let chunks: Subject<{ items: IKnowledgeDocumentChunk[]; total: number }>
  let params: BehaviorSubject<{ id: string }>
  const knowledgebase = signal<Partial<IKnowledgebase>>({ id: 'kb-1' })
  const api = { getById: jest.fn(), getChunks: jest.fn(), getAnalysisPreview: jest.fn(), getChunkQuestions: jest.fn() }
  const observer = globalThis.IntersectionObserver
  const document = { id: 'doc-1', name: 'manual.pdf', disabled: false } as IKnowledgeDocument
  const root = () => fixture.nativeElement as HTMLElement

  async function settle() {
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
  }

  beforeEach(async () => {
    Object.defineProperty(globalThis, 'IntersectionObserver', {
      configurable: true,
      writable: true,
      value: class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    })
    detail = new Subject()
    chunks = new Subject()
    params = new BehaviorSubject({ id: 'doc-1' })
    knowledgebase.set({ id: 'kb-1' })
    api.getById.mockReturnValue(detail)
    api.getChunks.mockReturnValue(chunks)
    api.getAnalysisPreview.mockReturnValue(of({ available: false }))
    await TestBed.configureTestingModule({
      imports: [KnowledgeDocumentChunkComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideNoopAnimations(),
        { provide: Dialog, useValue: { open: jest.fn() } },
        { provide: KnowledgeDocumentService, useValue: api },
        { provide: KnowledgebaseComponent, useValue: { knowledgebase } },
        { provide: ToastrService, useValue: { error: jest.fn() } },
        {
          provide: ActivatedRoute,
          useValue: {
            params,
            queryParams: of({}),
            snapshot: { params: params.value, queryParams: {} }
          }
        }
      ]
    }).compileComponents()
    fixture = TestBed.createComponent(KnowledgeDocumentChunkComponent)
    await settle()
    fixture.componentInstance.onIntersection()
    await settle()
  })

  afterEach(() => {
    fixture?.destroy()
    TestBed.resetTestingModule()
    jest.clearAllMocks()
    Object.defineProperty(globalThis, 'IntersectionObserver', { configurable: true, writable: true, value: observer })
  })

  it.each([403, 404, 500])('renders a detail %s error instead of freezing after chunks succeed', async (status) => {
    expect(root().querySelector('xp-spin')).not.toBeNull()
    detail.error(new HttpErrorResponse({ status, error: { message: 'Document cannot be loaded' } }))
    chunks.next({ items: [], total: 0 })
    chunks.complete()
    await settle()

    expect(root().querySelector('xp-spin')).toBeNull()
    expect(root().querySelector('[role="alert"]')?.textContent).toContain('Document cannot be loaded')
    expect(root().querySelector('[data-document-retry]')).not.toBeNull()
    expect(root().querySelector('z-switch')).toBeNull()
    expect(() => fixture.componentInstance.document()).not.toThrow()
  })

  it('allows a failed detail request to be retried and restores the document', async () => {
    detail.error(new HttpErrorResponse({ status: 403, error: { message: 'Access denied' } }))
    chunks.next({ items: [], total: 0 })
    chunks.complete()
    await settle()
    detail = new Subject()
    api.getById.mockReturnValue(detail)

    root().querySelector<HTMLButtonElement>('[data-document-retry]').click()
    await settle()
    expect(api.getById).toHaveBeenCalledTimes(2)
    expect(root().querySelector('[role="alert"]')).toBeNull()
    expect(root().querySelector('xp-spin')).not.toBeNull()
    detail.next(document)
    detail.complete()
    await settle()

    expect(root().querySelector('xp-spin')).toBeNull()
    expect(root().querySelector('knowledge-doc-id')).not.toBeNull()
    expect(fixture.componentInstance.document()).toEqual(document)
    expect(root().querySelector('z-switch')).not.toBeNull()
  })

  it('does not let a pending chunk request cover the detail error and retry action', async () => {
    detail.error(new HttpErrorResponse({ status: 403, error: { message: 'Access denied' } }))
    await settle()
    expect(root().querySelector('xp-spin')).toBeNull()
    expect(root().querySelector('[data-document-retry]')).not.toBeNull()
  })

  it('preserves normal document and chunk loading', async () => {
    detail.next(document)
    chunks.next({ items: [], total: 0 })
    chunks.complete()
    await settle()
    expect(root().querySelector('[role="alert"]')).toBeNull()
    expect(root().querySelector('xp-spin')).toBeNull()
    expect(fixture.componentInstance.total()).toBe(0)
    expect(fixture.componentInstance.docEnabled()).toBe(true)
  })

  it.each([
    { documentEnabled: undefined, knowledgebaseEnabled: undefined, visible: false },
    { documentEnabled: undefined, knowledgebaseEnabled: true, visible: true },
    { documentEnabled: false, knowledgebaseEnabled: true, visible: false },
    { documentEnabled: true, knowledgebaseEnabled: false, visible: true }
  ])('renders questions only when effective generation is enabled: %j', async (settings) => {
    const { documentEnabled, knowledgebaseEnabled, visible } = settings
    knowledgebase.set({
      id: 'kb-1',
      parserConfig: {
        questionGeneration: knowledgebaseEnabled === undefined ? undefined : { enabled: knowledgebaseEnabled }
      }
    })
    detail.next({
      ...document,
      parserConfig: {
        questionGeneration: documentEnabled === undefined ? undefined : { enabled: documentEnabled }
      }
    })
    chunks.next({
      items: [{ id: 'chunk', pageContent: 'Source text', metadata: { chunkId: 'chunk', mediaType: 'text' } }],
      total: 1
    })
    await settle()
    expect(root().querySelectorAll('xp-knowledge-chunk-questions')).toHaveLength(visible ? 1 : 0)
    if (visible) {
      expect(root().querySelector('xp-knowledge-chunk-questions [role="button"]').textContent.trim()).toBe(
        'XP.Knowledgebase.Questions.Title'
      )
    }
    expect(root().querySelector('xp-knowledge-chunk')).not.toBeNull()
  })

  it('can load another document after a detail error without recreating the component', async () => {
    detail.error(new HttpErrorResponse({ status: 403, error: { message: 'Access denied' } }))
    chunks.next({ items: [], total: 0 })
    await settle()
    detail = new Subject()
    api.getById.mockReturnValue(detail)
    params.next({ id: 'doc-2' })
    await settle()

    expect(api.getById).toHaveBeenLastCalledWith('doc-2')
    expect(root().querySelector('[role="alert"]')).toBeNull()
    detail.next({ ...document, id: 'doc-2' })
    chunks.next({ items: [], total: 0 })
    await settle()
    expect(root().querySelector('xp-spin')).toBeNull()
    expect(fixture.componentInstance.document()?.id).toBe('doc-2')
  })

  it('places numbered question panels beneath their own children and keeps them lazy', async () => {
    detail.next({ ...document, parserConfig: { questionGeneration: { enabled: true } } })
    chunks.next({
      items: [
        { id: 'parent', pageContent: 'Parent context', metadata: { chunkId: 'parent', type: 'parent' } },
        {
          id: 'child-b',
          pageContent: 'Second child text',
          metadata: { chunkId: 'child-b', parentId: 'parent', chunkIndex: 8 }
        },
        {
          id: 'child-a',
          pageContent: 'First child text',
          metadata: { chunkId: 'child-a', parentId: 'parent', chunkIndex: 3 }
        }
      ],
      total: 3
    })
    await settle()
    expect(root().querySelector('xp-knowledge-chunk-questions')).toBeNull()

    const chunkView = fixture.debugElement.query(By.directive(KnowledgeChunkComponent))
      .componentInstance as KnowledgeChunkComponent
    chunkView.expanded.set(true)
    await settle()
    const panels = [...root().querySelectorAll<HTMLElement>('xp-knowledge-chunk-questions')]
    expect(panels).toHaveLength(2)
    expect(panels[0].parentElement.textContent).toContain('First child text')
    expect(panels[0].parentElement.textContent).not.toContain('Second child text')
    expect(panels[1].parentElement.textContent).toContain('Second child text')
    expect(panels.map((panel) => panel.querySelector('[role="button"]').textContent.trim())).toEqual([
      'C-1 · XP.Knowledgebase.Questions.Title',
      'C-2 · XP.Knowledgebase.Questions.Title'
    ])
    expect(api.getChunkQuestions).not.toHaveBeenCalled()
    api.getChunkQuestions.mockReturnValue(of({ enabled: true }))
    panels[1].querySelector<HTMLElement>('[role="button"]').click()
    await settle()
    expect(api.getChunkQuestions).toHaveBeenCalledWith('doc-1', 'child-b')

    chunkView.expanded.set(false)
    await settle()
    expect(root().querySelector('xp-knowledge-chunk-questions')).toBeNull()
  })

  it('clears stale document controls if a subsequent detail refresh fails', async () => {
    detail.next(document)
    chunks.next({ items: [], total: 0 })
    await settle()
    expect(root().querySelector('z-switch')).not.toBeNull()

    detail = new Subject()
    api.getById.mockReturnValue(detail)
    fixture.componentInstance.refresh()
    await settle()
    expect(root().querySelector('z-switch')).toBeNull()
    detail.error(new HttpErrorResponse({ status: 403, error: { message: 'Access revoked' } }))
    await settle()
    expect(root().querySelector('[role="alert"]')?.textContent).toContain('Access revoked')
    expect(root().querySelector('xp-spin')).toBeNull()
    expect(root().querySelector('z-switch')).toBeNull()
  })
})
