import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { NGXLogger } from 'ngx-logger'
import { BehaviorSubject, Subscription } from 'rxjs'
import { Store } from '../state/store.service'
import { IUser, IXpertWorkspace, OrderTypeEnum } from '../types'
import { XpertWorkspaceService } from './xpert-workspace.service'

describe('XpertWorkspaceService shared workspace lists', () => {
  let service: XpertWorkspaceService
  let http: HttpTestingController
  let user: BehaviorSubject<Partial<IUser> | null>
  let organization: BehaviorSubject<string | null>
  let subscriptions: Subscription[]
  const workspaces: IXpertWorkspace[] = [{ id: 'workspace-1', name: 'First workspace', ownerId: 'user-1' }]

  beforeEach(() => {
    user = new BehaviorSubject<Partial<IUser> | null>({ id: 'user-1' })
    organization = new BehaviorSubject<string | null>('org-1')
    subscriptions = []
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        { provide: NGXLogger, useValue: {} },
        { provide: Store, useValue: { user$: user, selectOrganizationId: () => organization } }
      ]
    })
    service = TestBed.inject(XpertWorkspaceService)
    http = TestBed.inject(HttpTestingController)
  })

  afterEach(() => {
    subscriptions.forEach((subscription) => subscription.unsubscribe())
    http.verify()
  })

  function watchList(next = jest.fn()) {
    const subscription = service
      .getAllMy({ order: { updatedAt: OrderTypeEnum.DESC } }, { purpose: 'authoring' })
      .subscribe(next)
    subscriptions.push(subscription)
    return subscription
  }

  function listRequest() {
    return http.expectOne((request) => request.url === '/api/xpert-workspace/my')
  }

  it('shares an in-flight request and loaded data between the sidebar and recreated workspace pages', () => {
    const sidebar = jest.fn()
    const page = jest.fn()
    watchList(sidebar)
    const firstPage = watchList(page)
    listRequest().flush({ items: workspaces })
    expect(sidebar).toHaveBeenLastCalledWith({ items: workspaces })
    expect(page).toHaveBeenLastCalledWith({ items: workspaces })

    firstPage.unsubscribe()
    const nextPage = jest.fn()
    watchList(nextPage)
    expect(nextPage).toHaveBeenLastCalledWith({ items: workspaces })
    http.expectNone((request) => request.url === '/api/xpert-workspace/my')
  })

  it('invalidates data once on explicit refresh and updates all consumers', () => {
    const sidebar = jest.fn()
    const page = jest.fn()
    watchList(sidebar)
    watchList(page)
    listRequest().flush({ items: workspaces })

    service.refresh()
    const updated = { items: [{ ...workspaces[0], name: 'Renamed workspace' }] }
    listRequest().flush(updated)
    expect(sidebar).toHaveBeenLastCalledWith(updated)
    expect(page).toHaveBeenLastCalledWith(updated)
  })

  it('does not reuse cached workspaces across organizations, users or logout', () => {
    const sidebar = jest.fn()
    watchList(sidebar)
    watchList()
    listRequest().flush({ items: workspaces })

    organization.next('org-2')
    listRequest().flush({ items: [] })
    expect(sidebar).toHaveBeenLastCalledWith({ items: [] })

    organization.next('org-1')
    listRequest().flush({ items: workspaces })
    user.next({ id: 'user-2' })
    listRequest().flush({ items: [] })
    expect(sidebar).toHaveBeenLastCalledWith({ items: [] })

    user.next(null)
    watchList()
    expect(sidebar).toHaveBeenLastCalledWith({ items: [] })
    http.expectNone((request) => request.url === '/api/xpert-workspace/my')
  })

  it('keeps authoring and runtime queries separate', () => {
    watchList()
    subscriptions.push(
      service.getAllMy({ order: { updatedAt: OrderTypeEnum.DESC } }, { purpose: 'runtime' }).subscribe()
    )
    const requests = http.match((request) => request.url === '/api/xpert-workspace/my')
    expect(requests.map((request) => request.request.params.get('purpose'))).toEqual(['authoring', 'runtime'])
    requests.forEach((request) => request.flush({ items: [] }))
  })

  it('cancels in-flight requests on scope change and retries failed requests', () => {
    watchList()
    const stale = listRequest()
    organization.next('org-2')
    expect(stale.cancelled).toBe(true)
    listRequest().flush({ items: [] })

    const failed = jest.fn()
    subscriptions.push(service.getAllMy(undefined, { purpose: 'runtime' }).subscribe({ error: failed }))
    listRequest().flush({ message: 'Failed' }, { status: 500, statusText: 'Server error' })
    expect(failed).toHaveBeenCalledTimes(1)
    subscriptions.push(service.getAllMy(undefined, { purpose: 'runtime' }).subscribe())
    listRequest().flush({ items: [] })
  })
})
