import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { Observable, Subject, of } from 'rxjs'
import { ITag, KnowledgeTagCatalog } from '@xpert-ai/contracts'
import { provideNoopAnimations } from '@angular/platform-browser/animations'
import { ToastrService } from '@cloud/app/@core'
import { KnowledgeTagsService } from '@cloud/app/@core/services/knowledge-tags.service'
import { KnowledgeTagsComponent } from './knowledge-tags.component'

describe('knowledge tag selection', () => {
  const tag: ITag = { id: 'tag', name: 'Finance', targets: ['knowledgebase'] }
  const catalog = (canEdit = true): KnowledgeTagCatalog => ({ tags: [tag], available: [tag], canEdit })
  function fixture() {
    const api = {
      list: jest.fn<Observable<KnowledgeTagCatalog>, [string]>(() => of(catalog())),
      documentTags: jest.fn(() => of([])),
      select: jest.fn(() => of(undefined)),
      remove: jest.fn(() => of(undefined)),
      addManual: jest.fn(() => of([])),
      removeManual: jest.fn(() => of([]))
    }
    TestBed.configureTestingModule({
      imports: [KnowledgeTagsComponent, TranslateModule.forRoot()],
      providers: [
        provideNoopAnimations(),
        { provide: KnowledgeTagsService, useValue: api },
        { provide: ToastrService, useValue: { error: jest.fn(), success: jest.fn() } }
      ]
    })
    const fixture = TestBed.createComponent(KnowledgeTagsComponent)
    fixture.componentRef.setInput('knowledgebaseId', 'kb')
    fixture.detectChanges()
    return { fixture, component: fixture.componentInstance, api }
  }
  afterEach(() => TestBed.resetTestingModule())

  it('loads lazily and selects original tag ids without any definition creation API', async () => {
    const { component, api } = fixture()
    expect(api.list).not.toHaveBeenCalled()
    await component.refresh()
    expect(component.tags()).toEqual([tag])
    await component.select('existing-tag')
    expect(api.select).toHaveBeenCalledWith('kb', 'existing-tag')
    await component.unselect('tag')
    expect(api.remove).toHaveBeenCalledWith('kb', 'tag')
  })

  it('ignores stale catalog and permission responses after switching knowledgebases', async () => {
    const { fixture: view, component, api } = fixture()
    const pending = new Subject<KnowledgeTagCatalog>()
    api.list.mockReturnValue(pending)
    const loading = component.refresh()
    view.componentRef.setInput('knowledgebaseId', 'other-kb')
    view.detectChanges()
    pending.next(catalog())
    pending.complete()
    await loading
    expect(component.tags()).toEqual([])
    expect(component.canEdit()).toBe(false)
  })

  it('uses manual endpoints for document associations', async () => {
    const { fixture: view, component, api } = fixture()
    view.componentRef.setInput('documentId', 'doc')
    view.detectChanges()
    await component.refresh()
    await component.assign('tag')
    await component.unassign('tag')
    expect(api.addManual).toHaveBeenCalledWith('kb', 'doc', 'tag')
    expect(api.removeManual).toHaveBeenCalledWith('kb', 'doc', 'tag')
    expect(api.select).not.toHaveBeenCalled()
  })

  it('blocks all writes for readers while retaining the selected labels', async () => {
    const { component, api } = fixture()
    api.list.mockReturnValue(of(catalog(false)))
    await component.refresh()
    await component.select('tag')
    await component.unselect('tag')
    await component.assign('tag')
    await component.unassign('tag')
    expect(component.tags()).toEqual([tag])
    for (const write of [api.select, api.remove, api.addManual, api.removeManual]) expect(write).not.toHaveBeenCalled()
  })

  it('keeps disabled history visible and restricts new document choices to active linked definitions', async () => {
    const { fixture: view, component, api } = fixture()
    view.componentRef.setInput('documentId', 'doc')
    view.detectChanges()
    api.list.mockReturnValue(
      of({
        canEdit: true,
        tags: [tag, { ...tag, id: 'disabled', isActive: false }, { ...tag, id: 'unavailable' }],
        available: [tag, { ...tag, id: 'not-linked' }]
      })
    )
    await component.refresh()
    expect(component.tags()).toHaveLength(3)
    expect(component.options()).toEqual([tag])
  })
})
