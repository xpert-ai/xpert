import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { BehaviorSubject, Observable, of, Subject, throwError } from 'rxjs'
import { Store } from '../../../@core'
import { SidebarSearchResultsComponent } from './sidebar-search-results.component'
import { SidebarSearchService } from '../../../@core/services/sidebar-search.service'
import { SidebarSearchPage } from './sidebar-search.types'

const page = (id: string, total = 1): SidebarSearchPage => ({
  items: [{ id, title: id, icon: 'ri-folder-line', route: ['/project', id] }],
  total
})

describe('sidebar business search session', () => {
  let fixture: ComponentFixture<SidebarSearchResultsComponent>
  let organization: BehaviorSubject<string>
  let search: jest.Mock
  beforeEach(() => {
    organization = new BehaviorSubject('org-a')
    search = jest.fn(() => of(page('first')))
    TestBed.configureTestingModule({
      imports: [SidebarSearchResultsComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: SidebarSearchService, useValue: { search } },
        {
          provide: Store,
          useValue: {
            user$: new BehaviorSubject({ id: 'user-a' }),
            selectOrganizationId: () => organization,
            selectActiveScope: () => of({ level: 'organization', organizationId: 'org-a' })
          }
        }
      ]
    })
    fixture = TestBed.createComponent(SidebarSearchResultsComponent)
    fixture.componentRef.setInput('source', 'projects')
    fixture.componentRef.setInput('query', 'first')
  })

  it('debounces requests and cancels both old queries and old organization requests immediately', fakeAsync(() => {
    const old = new Subject<SidebarSearchPage>()
    search.mockReturnValue(old)
    fixture.detectChanges()
    tick(249)
    expect(search).not.toHaveBeenCalled()
    tick(1)
    expect(old.observed).toBe(true)
    fixture.componentRef.setInput('query', 'second')
    fixture.detectChanges()
    expect(old.observed).toBe(false)
    expect(fixture.componentInstance.page().items).toEqual([])
    const next = new Subject<SidebarSearchPage>()
    search.mockReturnValue(next)
    tick(250)
    organization.next('org-b')
    fixture.detectChanges()
    expect(next.observed).toBe(false)
    next.next(page('wrong-organization'))
    search.mockReturnValue(of(page('correct-organization')))
    tick(250)
    fixture.detectChanges()
    expect(fixture.componentInstance.page().items.map((item) => item.id)).toEqual(['correct-organization'])
    fixture.destroy()
  }))

  it('preserves successful pages on failure, retries the same offset, and prevents overlapping requests', fakeAsync(() => {
    search.mockReturnValueOnce(of(page('first', 3)))
    fixture.detectChanges()
    tick(250)
    const pending = new Subject<SidebarSearchPage>()
    search.mockReturnValueOnce(pending)
    fixture.componentInstance.loadMore()
    fixture.componentInstance.loadMore()
    expect(search).toHaveBeenCalledTimes(2)
    expect(search.mock.calls[1][2]).toBe(1)
    pending.error(new Error('503'))
    expect(fixture.componentInstance.page().items).toHaveLength(1)
    search.mockReturnValueOnce(of(page('second', 2)))
    fixture.componentInstance.loadMore()
    expect(search.mock.calls[2][2]).toBe(1)
    expect(fixture.componentInstance.page().items.map((item) => item.id)).toEqual(['first', 'second'])
    fixture.destroy()
  }))

  it('stops pagination after overlapping pages instead of comparing the deduplicated count to total', fakeAsync(() => {
    search.mockReturnValueOnce(of(page('same', 2))).mockReturnValueOnce(of(page('same', 2)))
    fixture.detectChanges()
    tick(250)
    fixture.componentInstance.loadMore()
    expect(fixture.componentInstance.page().items).toHaveLength(1)
    expect(fixture.componentInstance.hasMore()).toBe(false)
    fixture.destroy()
  }))

  it('clears results on blank input, cancels on destroy, and treats failure differently from no matches', fakeAsync(() => {
    search.mockReturnValue(throwError(() => new Error('forbidden')))
    fixture.detectChanges()
    tick(250)
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull()
    expect(fixture.nativeElement.textContent).not.toContain('XP.Sidebar.Search.Empty')
    fixture.componentRef.setInput('query', ' ')
    fixture.detectChanges()
    tick(250)
    expect(search).toHaveBeenCalledTimes(1)
    const cancelled = jest.fn()
    search.mockReturnValue(new Observable(() => cancelled))
    fixture.componentRef.setInput('query', 'another')
    fixture.detectChanges()
    tick(250)
    fixture.destroy()
    expect(cancelled).toHaveBeenCalledTimes(1)
  }))

  it('uses independent component state for different panels and skips unauthenticated searches', fakeAsync(() => {
    fixture.detectChanges()
    tick(250)
    const other = TestBed.createComponent(SidebarSearchResultsComponent)
    other.componentRef.setInput('source', 'models')
    other.componentRef.setInput('query', 'gpt')
    search.mockReturnValue(of(page('gpt')))
    other.detectChanges()
    tick(250)
    expect(other.componentInstance.page().items[0].id).toBe('gpt')
    expect(fixture.componentInstance.page().items[0].id).toBe('first')
    TestBed.inject(Store).user$.next(null)
    fixture.detectChanges()
    other.detectChanges()
    tick(250)
    expect(fixture.componentInstance.page().items).toHaveLength(0)
    expect(other.componentInstance.page().items).toHaveLength(0)
    expect(search).toHaveBeenCalledTimes(2)
    fixture.destroy()
    other.destroy()
  }))
})
