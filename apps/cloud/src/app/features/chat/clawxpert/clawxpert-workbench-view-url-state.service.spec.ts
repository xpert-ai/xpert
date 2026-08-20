import { TestBed } from '@angular/core/testing'
import {
  DefaultUrlSerializer,
  NavigationEnd,
  Router,
  type NavigationBehaviorOptions,
  type UrlTree
} from '@angular/router'
import { Subject } from 'rxjs'
import { ClawXpertWorkbenchViewUrlState } from './clawxpert-workbench-view-url-state.service'

describe('ClawXpertWorkbenchViewUrlState', () => {
  const serializer = new DefaultUrlSerializer()
  let navigationEvents: Subject<NavigationEnd>
  let router: {
    url: string
    events: ReturnType<Subject<NavigationEnd>['asObservable']>
    parseUrl: (url: string) => UrlTree
    navigateByUrl: jest.Mock<Promise<boolean>, [UrlTree, NavigationBehaviorOptions]>
  }

  beforeEach(() => {
    navigationEvents = new Subject<NavigationEnd>()
    router = {
      url: '/chat/clawxpert/c/thread-1?mode=focus&view=review#details',
      events: navigationEvents.asObservable(),
      parseUrl: (url) => serializer.parse(url),
      navigateByUrl: jest.fn(async (tree) => {
        const nextUrl = serializer.serialize(tree)
        router.url = nextUrl
        navigationEvents.next(new NavigationEnd(1, nextUrl, nextUrl))
        return true
      })
    }

    TestBed.configureTestingModule({
      providers: [
        ClawXpertWorkbenchViewUrlState,
        {
          provide: Router,
          useValue: router
        }
      ]
    })
  })

  afterEach(() => {
    navigationEvents.complete()
    TestBed.resetTestingModule()
  })

  it('reads the selected extension view from the current URL', () => {
    const state = TestBed.inject(ClawXpertWorkbenchViewUrlState)

    expect(state.viewKey()).toBe('review')
    expect(state.viewQuery()).toBeNull()
  })

  it('persists the selected record and view parameters for refresh recovery', async () => {
    const state = TestBed.inject(ClawXpertWorkbenchViewUrlState)

    await state.setViewState('review', {
      selectionId: 'project-1',
      parameters: { view: 'project-review', section: 'quality', page: 2 }
    })

    expect(router.parseUrl(router.url).queryParams).toEqual(
      expect.objectContaining({
        view: 'review',
        viewSelection: 'project-1',
        viewParameters: JSON.stringify({ view: 'project-review', section: 'quality', page: 2 })
      })
    )
    expect(state.viewQuery()).toEqual({
      selectionId: 'project-1',
      parameters: { view: 'project-review', section: 'quality', page: 2 }
    })
  })

  it('updates the view query parameter while preserving the route, other parameters, and fragment', async () => {
    const state = TestBed.inject(ClawXpertWorkbenchViewUrlState)

    await state.setViewKey('metrics')

    const navigatedTree = router.navigateByUrl.mock.calls[0][0]
    expect(serializer.serialize(navigatedTree)).toBe('/chat/clawxpert/c/thread-1?mode=focus&view=metrics#details')
    expect(router.navigateByUrl.mock.calls[0][1]).toEqual({ replaceUrl: false })
    expect(state.viewKey()).toBe('metrics')
  })

  it('removes only the view parameter when a non-extension tab becomes active', async () => {
    const state = TestBed.inject(ClawXpertWorkbenchViewUrlState)

    await state.setViewKey(null, { replaceUrl: true })

    const navigatedTree = router.navigateByUrl.mock.calls[0][0]
    expect(serializer.serialize(navigatedTree)).toBe('/chat/clawxpert/c/thread-1?mode=focus#details')
    expect(router.navigateByUrl.mock.calls[0][1]).toEqual({ replaceUrl: true })
    expect(state.viewKey()).toBeNull()
  })

  it('tracks extension view changes from browser back, forward, and direct URL navigation', () => {
    const state = TestBed.inject(ClawXpertWorkbenchViewUrlState)

    router.url = '/chat/clawxpert/c/thread-1?view=metrics'
    navigationEvents.next(new NavigationEnd(2, router.url, router.url))
    expect(state.viewKey()).toBe('metrics')

    router.url = `/chat/clawxpert/c/thread-1?view=metrics&viewSelection=row-2&viewParameters=${encodeURIComponent(JSON.stringify({ section: 'history' }))}`
    navigationEvents.next(new NavigationEnd(3, router.url, router.url))
    expect(state.viewQuery()).toEqual({ selectionId: 'row-2', parameters: { section: 'history' } })

    router.url = '/chat/clawxpert/c/thread-1'
    navigationEvents.next(new NavigationEnd(4, router.url, router.url))
    expect(state.viewKey()).toBeNull()
    expect(state.viewQuery()).toBeNull()
  })
})
