import { Component, signal } from '@angular/core'
import { fakeAsync, TestBed, tick } from '@angular/core/testing'
import { of, Subject, throwError } from 'rxjs'
import { IKnowledgebase, IKnowledgeDocument, KnowledgebaseTypeEnum, KBDocumentStatusEnum } from '@xpert-ai/contracts'
import { KnowledgeDocumentService } from '@cloud/app/@core/services/knowledge-document.service'
import { injectDocumentTags } from './document-tags-refresh'

@Component({ standalone: true, template: '' })
class Host {
  kb = signal<IKnowledgebase>({
    id: 'kb',
    type: KnowledgebaseTypeEnum.Standard,
    automaticTagging: { enabled: true }
  } as IKnowledgebase)
  docs = signal<IKnowledgeDocument[]>([{ id: 'doc', status: KBDocumentStatusEnum.FINISH } as IKnowledgeDocument])
  tags = injectDocumentTags(this.kb, this.docs)
}
const assignment = { tagId: 'tag', documentId: 'doc', source: 'automatic' as const, tag: { id: 'tag', name: 'API' } }

describe('Document tags live refresh', () => {
  const api = { getAll: jest.fn() }
  beforeEach(() => {
    api.getAll.mockReset().mockReturnValue(of({ items: [{ id: 'doc', tagAssignments: [] }] }))
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [{ provide: KnowledgeDocumentService, useValue: api }]
    })
    jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  })
  afterEach(() => jest.restoreAllMocks())

  it('refreshes tags after parsing is FINISH and after a transient error, without overlapping requests', fakeAsync(() => {
    const fixture = TestBed.createComponent(Host)
    fixture.detectChanges()
    tick(0)
    expect(fixture.componentInstance.tags().get('doc')).toEqual([])
    const pending = new Subject<{ items: IKnowledgeDocument[] }>()
    api.getAll.mockReturnValueOnce(pending)
    tick(5000)
    tick(5000)
    expect(api.getAll).toHaveBeenCalledTimes(2)
    pending.next({ items: [{ id: 'doc', tagAssignments: [assignment] } as IKnowledgeDocument] })
    expect(fixture.componentInstance.tags().get('doc')).toEqual([assignment])
    api.getAll.mockReturnValueOnce(throwError(() => new Error('offline')))
    tick(5000)
    expect(fixture.componentInstance.tags().get('doc')).toEqual([assignment])
    tick(5000)
    expect(fixture.componentInstance.tags().get('doc')).toEqual([])
    fixture.destroy()
    const calls = api.getAll.mock.calls.length
    tick(10000)
    expect(api.getAll).toHaveBeenCalledTimes(calls)
  }))

  it('cancels stale requests on scope change and pauses hidden, disabled and empty lists', fakeAsync(() => {
    const fixture = TestBed.createComponent(Host)
    const pending = new Subject<{ items: IKnowledgeDocument[] }>()
    api.getAll.mockReturnValueOnce(pending)
    fixture.detectChanges()
    tick(0)
    fixture.componentInstance.kb.update((kb) => ({ ...kb, id: 'other' }))
    fixture.detectChanges()
    tick(0)
    expect(pending.observed).toBe(false)
    expect(api.getAll.mock.lastCall[0].where.knowledgebaseId).toBe('other')
    jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    const calls = api.getAll.mock.calls.length
    tick(10000)
    expect(api.getAll).toHaveBeenCalledTimes(calls)
    jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    tick(5000)
    expect(api.getAll).toHaveBeenCalledTimes(calls + 1)
    fixture.componentInstance.kb.update((kb) => ({ ...kb, automaticTagging: { enabled: false } }))
    fixture.detectChanges()
    tick(10000)
    expect(api.getAll).toHaveBeenCalledTimes(calls + 1)
    fixture.componentInstance.docs.set([])
    fixture.componentInstance.kb.update((kb) => ({ ...kb, automaticTagging: { enabled: true } }))
    fixture.detectChanges()
    tick(10000)
    expect(api.getAll).toHaveBeenCalledTimes(calls + 1)
    fixture.destroy()
  }))
})
