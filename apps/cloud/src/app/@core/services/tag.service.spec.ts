import { provideHttpClient } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { ITag, TagCategoryEnum } from '@xpert-ai/contracts'
import { BehaviorSubject } from 'rxjs'
import { Store } from '../state/store.service'
import { TagService } from './tag.service'

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
