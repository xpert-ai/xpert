import { provideHttpClient } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { Component, signal } from '@angular/core'
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing'
import {
  IKnowledgebase,
  IKnowledgeDocument,
  KBDocumentStatusEnum,
  KnowledgebaseTypeEnum,
  KnowledgeWikiDocumentProgress
} from '../../../../../@core'
import { injectDocumentWikiProgress } from './document-wiki-status'

const ready = (documentId: string): KnowledgeWikiDocumentProgress => ({
  documentId,
  state: 'ready',
  canView: true,
  stages: { generation: 'complete', indexing: 'complete', publication: 'complete' }
})

@Component({ standalone: true, template: '' })
class HostComponent {
  readonly knowledgebase = signal<IKnowledgebase>({
    id: 'kb-1',
    type: KnowledgebaseTypeEnum.Standard,
    wikiConfig: { enabled: true, extractionGranularity: 'standard' }
  } as IKnowledgebase)
  readonly documents = signal<IKnowledgeDocument[]>([
    { id: 'doc-1', status: KBDocumentStatusEnum.FINISH, version: 1 } as IKnowledgeDocument
  ])
  readonly selectedDocument = signal<IKnowledgeDocument | null>(null)
  readonly indexed = injectDocumentWikiProgress(this.knowledgebase, this.documents, this.selectedDocument)
}

describe('Document Wiki completion status', () => {
  let fixture: ComponentFixture<HostComponent>
  let http: HttpTestingController

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    })
    fixture = TestBed.createComponent(HostComponent)
    http = TestBed.inject(HttpTestingController)
  })
  afterEach(() => {
    fixture.destroy()
    http.verify()
  })
  function refresh() {
    fixture.detectChanges()
    TestBed.flushEffects()
    tick(0)
  }
  function flush(ids: string[] = []) {
    const request = http.expectOne((request) => request.url === '/api/knowledgebase/kb-1/wiki/documents/status')
    request.flush({ indexedDocumentIds: ids, documents: ids.map(ready) })
  }

  it('includes a nested file selected outside the table without duplicate requests', fakeAsync(() => {
    fixture.componentInstance.selectedDocument.set({
      id: 'nested-doc',
      status: KBDocumentStatusEnum.FINISH
    } as IKnowledgeDocument)
    refresh()
    const request = http.expectOne((request) => request.params.get('documentIds') === 'doc-1,nested-doc')
    request.flush({ indexedDocumentIds: [], documents: [{ ...ready('nested-doc'), state: 'generating' }] })
    expect(fixture.componentInstance.indexed().get('nested-doc').state).toBe('generating')
    fixture.componentInstance.selectedDocument.set(fixture.componentInstance.documents()[0])
    refresh()
    http.expectNone(() => true)
    expect(fixture.componentInstance.indexed().has('nested-doc')).toBe(false)
    fixture.destroy()
  }))

  it('continues to show a failure before the first usable Wiki publication', fakeAsync(() => {
    fixture.componentInstance.knowledgebase.update((kb) => ({ ...kb, wikiAvailability: 'unavailable' }))
    refresh()
    http
      .expectOne(() => true)
      .flush({ indexedDocumentIds: [], documents: [{ ...ready('doc-1'), state: 'failed', canView: false }] })
    expect(fixture.componentInstance.indexed().get('doc-1').state).toBe('failed')
    fixture.destroy()
  }))

  it('waits for authoritative status, refreshes in place, and discards a stale source result', fakeAsync(() => {
    refresh()
    expect(fixture.componentInstance.indexed().size).toBe(0)
    flush(['doc-1'])
    expect(fixture.componentInstance.indexed().has('doc-1')).toBe(true)
    tick(5000)
    flush([])
    expect(fixture.componentInstance.indexed().size).toBe(0)
    tick(5000)
    flush(['doc-1'])
    fixture.componentInstance.documents.update((docs) => docs.map((doc) => ({ ...doc, version: 2 })))
    expect(fixture.componentInstance.indexed().size).toBe(0)
    refresh()
    flush([])
    fixture.destroy()
  }))

  it('refreshes only the changed document without blanking another document or the selected detail', fakeAsync(() => {
    const host = fixture.componentInstance
    host.documents.update((docs) => [...docs, { ...docs[0], id: 'doc-2' }])
    host.selectedDocument.set(host.documents()[1])
    refresh()
    flush(['doc-1', 'doc-2'])
    host.documents.update((docs) => docs.map((doc) => (doc.id === 'doc-1' ? { ...doc, version: 2 } : doc)))
    expect(host.indexed().has('doc-1')).toBe(false)
    expect(host.indexed().get('doc-2')).toEqual(ready('doc-2'))
    refresh()
    const changed = http.expectOne((request) => request.params.get('documentIds') === 'doc-1')
    changed.flush({ documents: [{ ...ready('doc-1'), state: 'generating', canView: false }] })
    expect(host.indexed().get('doc-1').state).toBe('generating')
    expect(host.indexed().get('doc-2')).toEqual(ready('doc-2'))
    tick(5000)
    flush(['doc-1', 'doc-2'])
    expect(host.indexed().size).toBe(2)
    fixture.destroy()
  }))

  it('does not lose another document when a changed source refresh fails', fakeAsync(() => {
    const host = fixture.componentInstance
    host.documents.update((docs) => [...docs, { ...docs[0], id: 'doc-2' }])
    refresh()
    flush(['doc-1', 'doc-2'])
    host.documents.update((docs) => docs.map((doc) => (doc.id === 'doc-1' ? { ...doc, version: 2 } : doc)))
    refresh()
    http.expectOne(() => true).flush({}, { status: 500, statusText: 'Failed' })
    expect(host.indexed().has('doc-1')).toBe(false)
    expect(host.indexed().get('doc-2')).toEqual(ready('doc-2'))
    fixture.destroy()
  }))

  it('uses the refreshed table source rather than a stale selected document snapshot', fakeAsync(() => {
    const host = fixture.componentInstance
    host.selectedDocument.set(host.documents()[0])
    refresh()
    flush(['doc-1'])
    host.documents.update((docs) => docs.map((doc) => ({ ...doc, version: 2 })))
    expect(host.indexed().has('doc-1')).toBe(false)
    refresh()
    flush([])
    fixture.destroy()
  }))

  it('cancels obsolete requests without blanking unchanged rows during consecutive source changes', fakeAsync(() => {
    const host = fixture.componentInstance
    host.documents.update((docs) => [...docs, { ...docs[0], id: 'doc-2' }])
    refresh()
    flush(['doc-1', 'doc-2'])
    host.documents.update((docs) => docs.map((doc) => (doc.id === 'doc-1' ? { ...doc, version: 2 } : doc)))
    refresh()
    const obsolete = http.expectOne((request) => request.params.get('documentIds') === 'doc-1')
    host.documents.update((docs) => docs.map((doc) => (doc.id === 'doc-1' ? { ...doc, version: 3 } : doc)))
    refresh()
    expect(obsolete.cancelled).toBe(true)
    expect(host.indexed().has('doc-1')).toBe(false)
    expect(host.indexed().get('doc-2')).toEqual(ready('doc-2'))
    flush(['doc-1'])
    expect(host.indexed().size).toBe(2)
    fixture.destroy()
  }))

  it('refreshes availability changes without emptying existing states while the request is pending', fakeAsync(() => {
    const host = fixture.componentInstance
    refresh()
    flush(['doc-1'])
    host.knowledgebase.update((kb) => ({ ...kb, wikiAvailability: 'unavailable' }))
    refresh()
    expect(host.indexed().get('doc-1')).toEqual(ready('doc-1'))
    http.expectOne(() => true).flush({ documents: [{ ...ready('doc-1'), state: 'outdated', canView: false }] })
    expect(host.indexed().get('doc-1').state).toBe('outdated')
    fixture.destroy()
  }))

  it.each([false, undefined])(
    'does not request or mark Wiki for disabled or legacy knowledgebases (%s)',
    fakeAsync((enabled) => {
      fixture.componentInstance.knowledgebase.update((kb) => ({
        ...kb,
        wikiConfig: enabled === undefined ? undefined : { enabled, extractionGranularity: 'standard' }
      }))
      refresh()
      http.expectNone(() => true)
      expect(fixture.componentInstance.indexed().size).toBe(0)
    })
  )

  it('loads states for unfinished and disabled sources, but never folders', fakeAsync(() => {
    fixture.componentInstance.documents.update((docs) => [
      ...docs,
      { id: 'doc-2', status: KBDocumentStatusEnum.RUNNING } as IKnowledgeDocument,
      { id: 'doc-3', status: KBDocumentStatusEnum.FINISH, disabled: true } as IKnowledgeDocument,
      { id: 'doc-4', status: KBDocumentStatusEnum.FINISH, sourceType: 'folder' } as IKnowledgeDocument
    ])
    refresh()
    const request = http.expectOne((request) => request.params.get('documentIds') === 'doc-1,doc-2,doc-3')
    request.flush({
      indexedDocumentIds: ['doc-1'],
      documents: [
        ready('doc-1'),
        { ...ready('doc-2'), state: 'not_started', canView: false },
        { ...ready('doc-3'), state: 'not_started', canView: false },
        ready('doc-4')
      ]
    })
    expect([...fixture.componentInstance.indexed().keys()]).toEqual(['doc-1', 'doc-2', 'doc-3'])
    expect(fixture.componentInstance.indexed().get('doc-2').state).toBe('not_started')
    fixture.destroy()
  }))

  it('clears old badges on request failure and cancels polling on Wiki disable or destruction', fakeAsync(() => {
    refresh()
    flush(['doc-1'])
    tick(5000)
    http.expectOne(() => true).flush({}, { status: 500, statusText: 'Failed' })
    expect(fixture.componentInstance.indexed().size).toBe(0)
    fixture.componentInstance.knowledgebase.update((kb) => ({
      ...kb,
      wikiConfig: { enabled: false, extractionGranularity: 'standard' }
    }))
    refresh()
    tick(5000)
    http.expectNone(() => true)
    fixture.destroy()
    tick(5000)
    http.expectNone(() => true)
  }))

  it('cancels a pending request when changing knowledgebases', fakeAsync(() => {
    refresh()
    const old = http.expectOne(() => true)
    fixture.componentInstance.knowledgebase.update((kb) => ({ ...kb, id: 'kb-2' }))
    fixture.componentInstance.documents.set([])
    refresh()
    expect(old.cancelled).toBe(true)
    expect(fixture.componentInstance.indexed().size).toBe(0)
    http.expectNone(() => true)
  }))

  it('never carries cached status into another knowledgebase, even with the same source id', fakeAsync(() => {
    refresh()
    flush(['doc-1'])
    fixture.componentInstance.knowledgebase.update((kb) => ({ ...kb, id: 'kb-2' }))
    expect(fixture.componentInstance.indexed().size).toBe(0)
    refresh()
    http
      .expectOne((request) => request.url === '/api/knowledgebase/kb-2/wiki/documents/status')
      .flush({ documents: [] })
    expect(fixture.componentInstance.indexed().size).toBe(0)
    fixture.destroy()
  }))

  it('applies batch responses independently and limits failures to that batch', fakeAsync(() => {
    const host = fixture.componentInstance
    host.documents.set(Array.from({ length: 101 }, (_, index) => ({ ...host.documents()[0], id: `doc-${index}` })))
    refresh()
    const initial = http.match(() => true)
    for (const request of initial) {
      request.flush({ documents: request.request.params.get('documentIds').split(',').map(ready) })
    }
    expect(host.indexed().size).toBe(101)
    tick(5000)
    const updates = http.match(() => true)
    const large = updates.find((request) => request.request.params.get('documentIds').split(',').length === 100)
    const small = updates.find((request) => request !== large)
    const smallId = small.request.params.get('documentIds')
    small.flush({ documents: [{ ...ready(smallId), state: 'generating', canView: false }] })
    expect(host.indexed().get(smallId).state).toBe('generating')
    expect(host.indexed().size).toBe(101)
    large.flush({}, { status: 500, statusText: 'Failed' })
    expect(host.indexed().size).toBe(1)
    expect(host.indexed().get(smallId).state).toBe('generating')
    fixture.destroy()
  }))

  it('batches a large document list without per-row requests', fakeAsync(() => {
    fixture.componentInstance.documents.set(
      Array.from(
        { length: 205 },
        (_, index) =>
          ({
            id: `doc-${index}`,
            status: KBDocumentStatusEnum.FINISH
          }) as IKnowledgeDocument
      )
    )
    refresh()
    const requests = http.match(() => true)
    expect(requests).toHaveLength(3)
    for (const request of requests) {
      expect(request.request.params.get('documentIds').split(',').length).toBeLessThanOrEqual(100)
      request.flush({ indexedDocumentIds: [] })
    }
    fixture.destroy()
  }))
})
