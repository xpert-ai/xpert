import { Dialog } from '@angular/cdk/dialog'
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http'
import { signal } from '@angular/core'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { provideNoopAnimations } from '@angular/platform-browser/animations'
import { ActivatedRoute, provideRouter } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { BehaviorSubject, of, Subject } from 'rxjs'
import {
  IKnowledgeDocument,
  IKnowledgeDocumentChunk,
  KnowledgeDocumentService,
  ToastrService
} from '../../../../../../@core'
import { KnowledgebaseComponent } from '../../knowledgebase.component'
import { KnowledgeDocumentChunkComponent } from './chunk.component'

jest.mock('@milkdown/crepe', () => ({ Crepe: jest.fn() }))
jest.mock('mermaid', () => ({ initialize: jest.fn(), render: jest.fn() }))
jest.mock('@xterm/xterm', () => ({ Terminal: jest.fn() }))

describe('Document chunk page loading failures', () => {
  let fixture: ComponentFixture<KnowledgeDocumentChunkComponent>
  let detail: Subject<IKnowledgeDocument>
  let chunks: Subject<{ items: IKnowledgeDocumentChunk[]; total: number }>
  let params: BehaviorSubject<{ id: string }>
  const api = { getById: jest.fn(), getChunks: jest.fn(), getAnalysisPreview: jest.fn() }
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
        { provide: KnowledgebaseComponent, useValue: { knowledgebase: signal({ id: 'kb-1' }) } },
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
