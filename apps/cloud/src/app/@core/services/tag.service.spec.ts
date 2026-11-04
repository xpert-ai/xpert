import { computed } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { provideHttpClient } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { ITag, TagCategoryEnum } from '@xpert-ai/contracts'
import { BehaviorSubject } from 'rxjs'
import { Store } from '../state/store.service'
import { injectTags, TagService } from './tag.service'

jest.mock('@milkdown/crepe', () => ({
  Crepe: class {
    static Feature = {}
  }
}))

describe('TagService selectable catalog', () => {
  it('supports multi-target and legacy tags, excludes disabled options and reloads on scope changes', () => {
    const scope = new BehaviorSubject({ organizationId: 'one' })
    TestBed.configureTestingModule({
      providers: [
        TagService,
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: Store,
          useValue: { selectActiveScope: () => scope, selectOrganizationId: () => new BehaviorSubject('one') }
        }
      ]
    })
    const service = TestBed.inject(TagService),
      http = TestBed.inject(HttpTestingController)
    let values: ITag[] = []
    let catalog: ITag[] = []
    const subscription = service.getAllByCategory(TagCategoryEnum.XPERT).subscribe((tags) => (values = tags))
    const catalogSubscription = service
      .getCatalogByCategory(TagCategoryEnum.XPERT)
      .subscribe((tags) => (catalog = tags))
    const first = [
      { id: 'multi', targets: [TagCategoryEnum.XPERT, TagCategoryEnum.TOOLSET] },
      { id: 'legacy', category: TagCategoryEnum.XPERT },
      { id: 'disabled', category: TagCategoryEnum.XPERT, isActive: false },
      { id: 'tool', category: TagCategoryEnum.TOOLSET }
    ]
    http.expectOne((request) => request.url.endsWith('/tags')).flush({ items: first, total: 4 })
    expect(values.map((tag) => tag.id)).toEqual(['multi', 'legacy'])
    expect(catalog.map((tag) => tag.id)).toEqual(['multi', 'legacy', 'disabled'])
    scope.next({ organizationId: 'two' })
    expect(values).toEqual([])
    expect(catalog).toEqual([])
    http
      .expectOne((request) => request.url.endsWith('/tags'))
      .flush({ items: [{ id: 'org-two', category: TagCategoryEnum.XPERT }], total: 1 })
    expect(values.map((tag) => tag.id)).toEqual(['org-two'])
    service.refresh()
    http.expectOne((request) => request.url.endsWith('/tags')).flush({ items: [], total: 0 })
    expect(values).toEqual([])
    subscription.unsubscribe()
    catalogSubscription.unsubscribe()
    http.verify()
    TestBed.resetTestingModule()
  })
})

describe('TagService failure recovery', () => {
  const scope = new BehaviorSubject({ tenantId: 'tenant-a', organizationId: 'one' })
  let service: TagService, http: HttpTestingController

  beforeEach(() => {
    scope.next({ tenantId: 'tenant-a', organizationId: 'one' })
    TestBed.configureTestingModule({
      providers: [
        TagService,
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: Store,
          useValue: { selectActiveScope: () => scope, selectOrganizationId: () => new BehaviorSubject('one') }
        }
      ]
    })
    service = TestBed.inject(TagService)
    http = TestBed.inject(HttpTestingController)
  })
  afterEach(() => {
    http.verify()
    TestBed.resetTestingModule()
  })

  it.each([403, 500, 0])('keeps signals readable and retries after HTTP %s without replacing subscribers', (status) => {
    const tags = TestBed.runInInjectionContext(() => injectTags(TagCategoryEnum.XPERT))
    const state = TestBed.runInInjectionContext(() => toSignal(service.getCatalogState()))
    const allTags = computed(() => tags().map((tag) => tag.id))
    const request = http.expectOne('/api/tags')
    if (status) request.flush({ message: 'Catalog unavailable' }, { status, statusText: 'Failure' })
    else request.error(new ProgressEvent('error'))
    for (let i = 0; i < 3; i++) expect(allTags()).toEqual([])
    expect(state().error).toBeTruthy()
    expect(state().loading).toBe(false)
    service.refresh()
    expect(state().error).toBeNull()
    expect(state().loading).toBe(true)
    http.expectOne('/api/tags').flush({ items: [{ id: 'recovered', category: TagCategoryEnum.XPERT }] })
    expect(allTags()).toEqual(['recovered'])
    expect(state().error).toBeNull()
  })

  it('shares requests across categories and recovers on scope changes without retaining foreign tags', () => {
    const experts = TestBed.runInInjectionContext(() => injectTags(TagCategoryEnum.XPERT))
    const prompts = TestBed.runInInjectionContext(() => injectTags('prompt_workflow'))
    const categories = TestBed.runInInjectionContext(() => toSignal(service.getAllCategories()))
    http.expectOne('/api/tags').flush({ items: [{ id: 'old', category: TagCategoryEnum.XPERT }] })
    expect(experts().map((tag) => tag.id)).toEqual(['old'])
    expect(categories()).toEqual([{ category: TagCategoryEnum.XPERT }])
    scope.next({ tenantId: 'tenant-a', organizationId: 'two' })
    expect(experts()).toEqual([])
    http.expectOne('/api/tags').flush(null, { status: 403, statusText: 'Forbidden' })
    scope.next({ tenantId: 'tenant-b', organizationId: 'three' })
    expect(experts()).toEqual([])
    http.expectOne('/api/tags').flush({ items: [{ id: 'new', targets: ['prompt_workflow'] }] })
    expect(experts()).toEqual([])
    expect(prompts().map((tag) => tag.id)).toEqual(['new'])
  })

  it('cancels in-flight old-scope requests and unsubscribes when the final consumer is destroyed', () => {
    const subscription = service.getAllByCategory().subscribe()
    const old = http.expectOne('/api/tags')
    scope.next({ tenantId: 'tenant-a', organizationId: 'two' })
    expect(old.cancelled).toBe(true)
    const current = http.expectOne('/api/tags')
    subscription.unsubscribe()
    expect(current.cancelled).toBe(true)
    service.refresh()
    http.expectNone('/api/tags')
    const fresh = service.getAllByCategory().subscribe()
    http.expectOne('/api/tags').flush({ items: [] })
    fresh.unsubscribe()
  })
})
