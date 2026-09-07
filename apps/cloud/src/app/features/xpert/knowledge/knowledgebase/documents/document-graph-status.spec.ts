import { Component, computed, signal } from '@angular/core'
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { Subject } from 'rxjs'
import {
  IKnowledgebase,
  IKnowledgeDocument,
  KBDocumentStatusEnum,
  KDocumentSourceType,
  KnowledgebaseService,
  KnowledgeGraphDocumentProgress,
  KnowledgeGraphStatus
} from '../../../../../@core'
import { DocumentGraphProgressComponent } from './document-graph-progress.component'
import { injectDocumentGraphProgress } from './document-graph-status'

const source = (id: string): IKnowledgeDocument =>
  ({ id, status: KBDocumentStatusEnum.FINISH, version: 1 }) as IKnowledgeDocument
const ready = (documentId: string): KnowledgeGraphDocumentProgress => ({
  documentId,
  state: 'ready',
  stages: { extraction: 'complete', persistence: 'complete', indexing: 'complete' }
})

@Component({
  standalone: true,
  imports: [DocumentGraphProgressComponent],
  template: `
    @for (doc of fileRows(); track doc.id) {
      <div [attr.data-row]="doc.id">
        <xp-document-graph-progress
          [knowledgebase]="knowledgebase()"
          [document]="doc"
          [snapshot]="progress().get(doc.id)"
          [details]="false"
        />
      </div>
    }
    @if (selectedDocument(); as doc) {
      <div data-inspector>
        <xp-document-graph-progress
          [knowledgebase]="knowledgebase()"
          [document]="doc"
          [snapshot]="progress().get(doc.id)"
        />
      </div>
    }
  `
})
class HostComponent {
  readonly knowledgebase = signal<IKnowledgebase>({
    id: 'kb-1',
    graphRag: { enabled: true },
    graphStatus: KnowledgeGraphStatus.READY
  } as IKnowledgebase)
  readonly documents = signal([source('doc-1')])
  readonly fileRows = computed(() => this.documents().filter((doc) => doc.sourceType !== KDocumentSourceType.FOLDER))
  readonly selectedDocument = signal<IKnowledgeDocument | null>(this.documents()[0])
  readonly progress = injectDocumentGraphProgress(this.knowledgebase, this.documents, this.selectedDocument)
}

describe('Shared graph progress in document rows and inspector', () => {
  let fixture: ComponentFixture<HostComponent>
  let requests: Array<{
    knowledgebaseId: string
    documentIds: string[]
    response: Subject<{ documents: KnowledgeGraphDocumentProgress[] }>
  }>
  const api = {
    getGraphDocumentsProgress: jest.fn((knowledgebaseId: string, documentIds: string[]) => {
      const response = new Subject<{ documents: KnowledgeGraphDocumentProgress[] }>()
      requests.push({ knowledgebaseId, documentIds, response })
      return response
    })
  }
  beforeEach(() => {
    requests = []
    TestBed.configureTestingModule({
      imports: [HostComponent, TranslateModule.forRoot()],
      providers: [provideRouter([]), { provide: KnowledgebaseService, useValue: api }]
    })
    fixture = TestBed.createComponent(HostComponent)
  })
  afterEach(() => {
    fixture.destroy()
    api.getGraphDocumentsProgress.mockClear()
  })
  function refresh() {
    fixture.detectChanges()
    TestBed.flushEffects()
    tick(0)
    fixture.detectChanges()
  }
  function respond(...documents: KnowledgeGraphDocumentProgress[]) {
    const request = [...requests].reverse().find((item) => item.documentIds.includes(documents[0].documentId))
    request.response.next({ documents })
    fixture.detectChanges()
  }
  function state(selector: string) {
    return (fixture.nativeElement as HTMLElement)
      .querySelector(`${selector} [data-graph-state]`)
      ?.getAttribute('data-graph-state')
  }

  it('updates the row and inspector together even while the cached knowledgebase says ready', fakeAsync(() => {
    refresh()
    expect(requests).toHaveLength(1)
    respond({ documentId: 'doc-1', state: 'running' })
    expect(state('[data-row="doc-1"]')).toBe('running')
    expect(state('[data-inspector]')).toBe('running')
    tick(5000)
    expect(requests).toHaveLength(2)
    respond(ready('doc-1'))
    expect(state('[data-row="doc-1"]')).toBe('ready')
    expect(state('[data-inspector]')).toBe('ready')
    fixture.destroy()
  }))

  it('batches 100 rows and slows finished rows while still detecting a later rebuild', fakeAsync(() => {
    const docs = Array.from({ length: 100 }, (_, i) => source(`doc-${i + 1}`))
    fixture.componentInstance.documents.set(docs)
    refresh()
    expect(requests).toHaveLength(1)
    expect(requests[0].documentIds).toHaveLength(100)
    respond(...docs.map((doc) => ready(doc.id)))
    tick(25000)
    expect(requests).toHaveLength(1)
    tick(5000)
    expect(requests).toHaveLength(2)
    respond(
      ...docs.map((doc) => (doc.id === 'doc-1' ? { documentId: doc.id, state: 'running' as const } : ready(doc.id)))
    )
    tick(5000)
    expect(requests[2].documentIds).toEqual(['doc-1'])
    respond(ready('doc-1'))
    expect(state('[data-inspector]')).toBe('ready')
    fixture.destroy()
  }))

  it('invalidates a changed source without blanking another row or inspector', fakeAsync(() => {
    const host = fixture.componentInstance
    host.documents.set([source('doc-1'), source('doc-2')])
    host.selectedDocument.set(host.documents()[1])
    refresh()
    respond(ready('doc-1'), ready('doc-2'))
    host.documents.update((docs) => docs.map((doc) => (doc.id === 'doc-1' ? { ...doc, version: 2 } : doc)))
    refresh()
    expect(requests[1].documentIds).toEqual(['doc-1'])
    expect(state('[data-row="doc-1"]')).toBe('loading')
    expect(state('[data-row="doc-2"]')).toBe('ready')
    expect(state('[data-inspector]')).toBe('ready')
    respond({ documentId: 'doc-1', state: 'outdated' })
    expect(state('[data-row="doc-1"]')).toBe('outdated')
    fixture.destroy()
  }))

  it('cancels obsolete batch results when the knowledgebase changes', fakeAsync(() => {
    const host = fixture.componentInstance
    refresh()
    const obsolete = requests[0].response
    host.knowledgebase.update((kb) => ({ ...kb, id: 'kb-2' }))
    refresh()
    expect(obsolete.observed).toBe(false)
    expect(state('[data-inspector]')).toBe('loading')
    expect(requests[1].knowledgebaseId).toBe('kb-2')
    obsolete.next({ documents: [ready('doc-1')] })
    expect(state('[data-inspector]')).toBe('loading')
    respond({ documentId: 'doc-1', state: 'not_started' })
    expect(state('[data-inspector]')).toBe('not_started')
    fixture.destroy()
  }))

  it('retries a failed batch without losing a completed batch', fakeAsync(() => {
    const docs = Array.from({ length: 101 }, (_, i) => source(`doc-${String(i).padStart(3, '0')}`))
    const host = fixture.componentInstance
    host.documents.set(docs)
    host.selectedDocument.set(docs[0])
    refresh()
    expect(requests).toHaveLength(2)
    requests[1].response.next({ documents: requests[1].documentIds.map(ready) })
    requests[0].response.error(new Error('offline'))
    fixture.detectChanges()
    expect(state('[data-inspector]')).toBe('unknown')
    expect(state('[data-row="doc-100"]')).toBe('ready')
    tick(5000)
    expect(requests[2].documentIds).toHaveLength(100)
    requests[2].response.next({ documents: requests[2].documentIds.map(ready) })
    fixture.detectChanges()
    expect(state('[data-inspector]')).toBe('ready')
    fixture.destroy()
  }))

  it('stops polling and cancels pending batches when graph is disabled', fakeAsync(() => {
    refresh()
    const pending = requests[0].response
    fixture.componentInstance.knowledgebase.update((kb) => ({ ...kb, graphRag: { enabled: false } }))
    refresh()
    expect(pending.observed).toBe(false)
    expect(state('[data-inspector]')).toBe('disabled')
    tick(30000)
    expect(requests).toHaveLength(1)
    fixture.destroy()
  }))

  it('bounds batch concurrency and does not overlap polling cycles', fakeAsync(() => {
    fixture.componentInstance.documents.set(Array.from({ length: 501 }, (_, i) => source(`doc-${i + 1}`)))
    refresh()
    expect(requests).toHaveLength(2)
    expect(requests.every((request) => request.documentIds.length <= 100)).toBe(true)
    tick(15000)
    expect(requests).toHaveLength(2)
    requests[0].response.next({ documents: requests[0].documentIds.map(ready) })
    expect(requests).toHaveLength(3)
    expect(requests.filter((request) => request.response.observed)).toHaveLength(2)
    fixture.destroy()
  }))

  it('removes filtered-out rows while retaining a selected nested file and excluding folders', fakeAsync(() => {
    const host = fixture.componentInstance
    host.documents.set([
      source('doc-1'),
      source('doc-2'),
      { ...source('folder'), sourceType: KDocumentSourceType.FOLDER }
    ])
    host.selectedDocument.set(source('nested-doc'))
    refresh()
    expect(requests[0].documentIds).toEqual(['doc-1', 'doc-2', 'nested-doc'])
    respond(ready('doc-1'), ready('doc-2'), ready('nested-doc'))
    host.documents.set([source('doc-1')])
    refresh()
    expect(host.progress().has('doc-2')).toBe(false)
    tick(30000)
    expect(requests[1].documentIds).toEqual(['doc-1', 'nested-doc'])
    fixture.destroy()
  }))
})
