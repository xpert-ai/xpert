import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { PluginApplicationInitializeInput, PluginApplicationStatusSummary } from '@xpert-ai/contracts'
import { NGXLogger } from 'ngx-logger'
import { BehaviorSubject, Subscription } from 'rxjs'
import { Store } from '../state/store.service'
import { IUser, IXpertWorkspace, OrderTypeEnum } from '../types'
import { PluginApplicationService } from './plugin-application.service'
import { XpertWorkspaceService } from './xpert-workspace.service'
import { XpertAPIService } from './xpert.service'

describe('PluginApplicationService initialization refresh', () => {
  const input: PluginApplicationInitializeInput = {
    pluginName: '@xpert-ai/plugin-bom-lifecycle',
    appName: 'bom-lifecycle',
    operationId: 'operation-1'
  }
  const ready: PluginApplicationStatusSummary = {
    appId: `${input.pluginName}:${input.appName}`,
    status: 'ready',
    workspaceId: 'bom-workspace',
    xpertId: 'bom-assistant',
    assistantSlug: 'bom-assistant'
  }
  let service: PluginApplicationService
  let workspaces: XpertWorkspaceService
  let workspaceRefresh: jest.SpyInstance
  let http: HttpTestingController
  let subscriptions: Subscription[]
  let xpertAPI: { refresh: jest.Mock }

  beforeEach(() => {
    subscriptions = []
    xpertAPI = { refresh: jest.fn() }
    const user = new BehaviorSubject<Partial<IUser> | null>({ id: 'user-1' })
    const organization = new BehaviorSubject<string | null>('org-1')
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        { provide: NGXLogger, useValue: {} },
        { provide: Store, useValue: { user$: user, selectOrganizationId: () => organization } },
        { provide: XpertAPIService, useValue: xpertAPI }
      ]
    })
    service = TestBed.inject(PluginApplicationService)
    workspaces = TestBed.inject(XpertWorkspaceService)
    workspaceRefresh = jest.spyOn(workspaces, 'refresh')
    http = TestBed.inject(HttpTestingController)
  })

  afterEach(() => {
    subscriptions.forEach((subscription) => subscription.unsubscribe())
    http.verify()
    jest.restoreAllMocks()
  })

  function listRequest() {
    return http.expectOne((request) => request.url === '/api/xpert-workspace/my')
  }

  it('invalidates cached workspace lists and notifies the Assistant sidebar after initialization is ready', () => {
    const sidebar = jest.fn()
    const workspacePage = jest.fn()
    const options = { order: { updatedAt: OrderTypeEnum.DESC } }
    subscriptions.push(workspaces.getAllMy(options, { purpose: 'authoring' }).subscribe(sidebar))
    subscriptions.push(workspaces.getAllMy(options, { purpose: 'authoring' }).subscribe(workspacePage))
    listRequest().flush({ items: [] })

    const initialized = jest.fn()
    service.initialize(input).subscribe(initialized)
    const request = http.expectOne('/api/plugin-applications/initialize')
    expect(request.request.method).toBe('POST')
    expect(request.request.body).toEqual(input)
    expect(workspaceRefresh).not.toHaveBeenCalled()
    expect(xpertAPI.refresh).not.toHaveBeenCalled()

    request.flush(ready)

    const items: IXpertWorkspace[] = [{ id: 'bom-workspace', name: 'BOM workspace', ownerId: 'user-1' }]
    listRequest().flush({ items })
    expect(sidebar).toHaveBeenLastCalledWith({ items })
    expect(workspacePage).toHaveBeenLastCalledWith({ items })
    expect(workspaceRefresh).toHaveBeenCalledTimes(1)
    expect(xpertAPI.refresh).toHaveBeenCalledTimes(1)
    expect(initialized).toHaveBeenCalledWith(ready)
  })

  it.each<PluginApplicationStatusSummary['status']>(['initializing', 'failed', 'degraded'])(
    'does not refresh resource lists while initialization reports %s',
    (status) => {
      const initialized = jest.fn()
      service.initialize(input).subscribe(initialized)
      const result: PluginApplicationStatusSummary = { appId: ready.appId, status }
      http.expectOne('/api/plugin-applications/initialize').flush(result)

      expect(initialized).toHaveBeenCalledWith(result)
      expect(workspaceRefresh).not.toHaveBeenCalled()
      expect(xpertAPI.refresh).not.toHaveBeenCalled()
    }
  )

  it('preserves initialization errors without refreshing resource lists', () => {
    const failed = jest.fn()
    service.initialize(input).subscribe({ error: failed })
    http
      .expectOne('/api/plugin-applications/initialize')
      .flush({ message: 'Initialization failed' }, { status: 500, statusText: 'Server error' })

    expect(failed).toHaveBeenCalledTimes(1)
    expect(workspaceRefresh).not.toHaveBeenCalled()
    expect(xpertAPI.refresh).not.toHaveBeenCalled()
  })
})
