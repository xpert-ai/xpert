import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { Store } from '@xpert-ai/cloud/state'
import { AiModelTypeEnum, UserModelGrantStatusEnum } from '@xpert-ai/contracts'
import { BehaviorSubject } from 'rxjs'
import { CopilotServerService } from './copilot-server.service'
import { ModelAccessService } from './model-access.service'

describe('ModelAccessService', () => {
  let refresh$: BehaviorSubject<boolean>
  let organizationId$: BehaviorSubject<string | null>
  let copilotServer: { refresh$: BehaviorSubject<boolean>; refresh: jest.Mock }
  let store: {
    selectOrganizationId: jest.Mock
    preferredLanguage: string
    user: {
      organizations: Array<{
        organization: {
          isDefault: boolean
          timeZone?: string
        }
      }>
    }
  }
  let httpMock: HttpTestingController
  let service: ModelAccessService

  beforeEach(() => {
    refresh$ = new BehaviorSubject(false)
    organizationId$ = new BehaviorSubject<string | null>(null)
    copilotServer = {
      refresh$,
      refresh: jest.fn(() => refresh$.next(true))
    }
    store = {
      selectOrganizationId: jest.fn(() => organizationId$),
      preferredLanguage: 'en-GB',
      user: {
        organizations: []
      }
    }
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        ModelAccessService,
        {
          provide: CopilotServerService,
          useValue: copilotServer
        },
        {
          provide: Store,
          useValue: store
        }
      ]
    })
    service = TestBed.inject(ModelAccessService)
    httpMock = TestBed.inject(HttpTestingController)
  })

  afterEach(() => {
    httpMock.verify()
  })

  it('refreshes account access data when the shared model catalog is invalidated', () => {
    const catalogSubscription = service.catalog$.subscribe()
    const requestSubscription = service.myRequests$.subscribe()
    const grantSubscription = service.myGrants$.subscribe()
    flushAccountRequests(httpMock)

    refresh$.next(true)
    flushAccountRequests(httpMock)

    catalogSubscription.unsubscribe()
    requestSubscription.unsubscribe()
    grantSubscription.unsubscribe()
  })

  it('reloads account access data when the active organization changes', () => {
    const catalogSubscription = service.catalog$.subscribe()
    const requestSubscription = service.myRequests$.subscribe()
    const grantSubscription = service.myGrants$.subscribe()
    flushAccountRequests(httpMock)

    organizationId$.next('org-1')
    flushAccountRequests(httpMock)

    catalogSubscription.unsubscribe()
    requestSubscription.unsubscribe()
    grantSubscription.unsubscribe()
  })

  it('invalidates the shared catalog after a mutation', () => {
    service
      .createRequest({
        copilotId: 'copilot-1',
        copilotModelId: 'model-1',
        modelType: AiModelTypeEnum.LLM,
        reason: 'Needed for authoring'
      })
      .subscribe()

    httpMock.expectOne((request) => request.url.endsWith('/model-access/requests')).flush({})

    expect(copilotServer.refresh).toHaveBeenCalled()
  })

  it.each([
    {
      action: 'withdraw',
      request: (target: ModelAccessService) => target.withdrawRequest('request-1', { reason: 'No longer needed' }),
      url: '/model-access/requests/request-1/withdraw'
    },
    {
      action: 'approve',
      request: (target: ModelAccessService) => target.approveRequest('request-1', { validUntil: null }),
      url: '/model-access/admin/requests/request-1/approve'
    },
    {
      action: 'reject',
      request: (target: ModelAccessService) => target.rejectRequest('request-1', { reason: 'Not approved' }),
      url: '/model-access/admin/requests/request-1/reject'
    },
    {
      action: 'extend',
      request: (target: ModelAccessService) => target.extendGrant('grant-1', { validUntil: null }),
      url: '/model-access/admin/grants/grant-1/extend'
    },
    {
      action: 'revoke',
      request: (target: ModelAccessService) => target.revokeGrant('grant-1', { reason: 'No longer allowed' }),
      url: '/model-access/admin/grants/grant-1/revoke'
    }
  ])('invalidates the shared catalog after $action', ({ request, url }) => {
    request(service).subscribe()

    httpMock.expectOne((httpRequest) => httpRequest.url.endsWith(url)).flush({})

    expect(copilotServer.refresh).toHaveBeenCalledTimes(1)
  })

  it('invalidates the shared catalog when the next active grant expires', () => {
    jest.useFakeTimers()
    try {
      const validUntil = new Date(Date.now() + 1_000).toISOString()
      const subscription = service.catalog$.subscribe()

      httpMock.expectOne((request) => request.url.endsWith('/model-access/catalog')).flush({
        items: [
          {
            grant: {
              status: UserModelGrantStatusEnum.Active,
              validUntil
            }
          }
        ]
      })

      jest.advanceTimersByTime(1_250)

      expect(copilotServer.refresh).toHaveBeenCalledTimes(1)
      httpMock.expectOne((request) => request.url.endsWith('/model-access/catalog')).flush({ items: [] })
      subscription.unsubscribe()
    } finally {
      jest.useRealTimers()
    }
  })

  it('formats expiration at the tenant timezone end of day', () => {
    store.user.organizations = [
      {
        organization: {
          isDefault: true,
          timeZone: 'Asia/Shanghai'
        }
      }
    ]

    expect(service.formatValidUntil('2027-03-14T15:59:59.999Z')).toBe('14 Mar 2027, 23:59:59')
  })

  it('uses UTC when the tenant timezone is not configured', () => {
    expect(service.formatValidUntil('2027-03-14T23:59:59.999Z')).toBe('14 Mar 2027, 23:59:59')
  })
})

function flushAccountRequests(httpMock: HttpTestingController) {
  httpMock.expectOne((request) => request.url.endsWith('/model-access/catalog')).flush({ items: [] })
  httpMock.expectOne((request) => request.url.endsWith('/model-access/requests/my')).flush([])
  httpMock.expectOne((request) => request.url.endsWith('/model-access/grants/my')).flush([])
}
