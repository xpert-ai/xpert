import { TestBed } from '@angular/core/testing'
import { KnowledgeDocumentService, ToastrService } from '@cloud/app/@core'
import type { DocumentInterface } from '@langchain/core/documents'
import { Subject } from 'rxjs'
import { KnowledgeFilePreviewComponent } from './preview.component'

describe('KnowledgeFilePreviewComponent states', () => {
  afterEach(() => TestBed.resetTestingModule())

  it.each([null, []])('finishes loading for an unavailable or empty preview (%s)', (documents) => {
    TestBed.configureTestingModule({
      providers: [
        { provide: KnowledgeDocumentService, useValue: {} },
        { provide: ToastrService, useValue: {} }
      ]
    })
    TestBed.overrideComponent(KnowledgeFilePreviewComponent, { set: { template: '', imports: [] } })
    const fixture = TestBed.createComponent(KnowledgeFilePreviewComponent)
    const response = new Subject<DocumentInterface[] | null>()
    fixture.componentRef.setInput('file', { preview$: response.asObservable() })
    const states: { loading: boolean; documents: DocumentInterface[] | null }[] = []
    const subscription = fixture.componentInstance.previewState().subscribe((state) => states.push(state))

    expect(states).toEqual([{ loading: true, documents: null }])
    response.next(documents)
    expect(states[1]).toEqual({ loading: false, documents })
    subscription.unsubscribe()
  })
})
