import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { XpertAccessRequestStatusEnum } from '../types'
import { XpertMarketplaceService } from './xpert-marketplace.service'

jest.mock('@xpert-ai/cloud/state', () => ({
  API_PREFIX: '/api'
}))

describe('XpertMarketplaceService', () => {
  let service: XpertMarketplaceService
  let httpMock: HttpTestingController

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [XpertMarketplaceService]
    })

    service = TestBed.inject(XpertMarketplaceService)
    httpMock = TestBed.inject(HttpTestingController)
  })

  afterEach(() => {
    httpMock.verify()
  })

  it('serializes marketplace filters into query parameters', () => {
    const next = jest.fn()
    service
      .findMarketplace({
        search: 'sales',
        businessCategories: ['sales'],
        capabilityTags: ['crm', 'report'],
        collaborationModes: ['multi-agent'],
        technicalCategories: ['tool-calling', 'workflow'],
        status: 'not_requested',
        sort: 'hot',
        skip: 10,
        take: 20
      })
      .subscribe(next)

    const request = httpMock.expectOne((req) => req.url === '/api/xpert-marketplace')

    expect(request.request.method).toBe('GET')
    expect(request.request.params.get('search')).toBe('sales')
    expect(request.request.params.get('businessCategories')).toBe('sales')
    expect(request.request.params.get('capabilityTags')).toBe('crm,report')
    expect(request.request.params.get('collaborationModes')).toBe('multi-agent')
    expect(request.request.params.get('technicalCategories')).toBe('tool-calling,workflow')
    expect(request.request.params.get('status')).toBe('not_requested')
    expect(request.request.params.get('sort')).toBe('hot')
    expect(request.request.params.get('skip')).toBe('10')
    expect(request.request.params.get('take')).toBe('20')

    const response = {
      items: [],
      recommendedTemplates: [],
      total: 0,
      reviewableCount: 0
    }
    request.flush(response)

    expect(next).toHaveBeenCalledWith(response)
  })

  it('calls access request and review endpoints with the expected methods', () => {
    service.requestAccess('xpert-1', { reason: 'Need it for support' }).subscribe()
    const createRequest = httpMock.expectOne('/api/xpert-marketplace/xpert-1/access-requests')
    expect(createRequest.request.method).toBe('POST')
    expect(createRequest.request.body).toEqual({
      reason: 'Need it for support'
    })
    createRequest.flush({
      id: 'request-1',
      xpertId: 'xpert-1',
      requesterId: 'user-1',
      status: XpertAccessRequestStatusEnum.REQUESTED
    })

    service.approveRequest('request-1', { response: 'Approved' }).subscribe()
    const approveRequest = httpMock.expectOne('/api/xpert-access-requests/request-1/approve')
    expect(approveRequest.request.method).toBe('PUT')
    expect(approveRequest.request.body).toEqual({
      response: 'Approved'
    })
    approveRequest.flush({
      id: 'request-1',
      xpertId: 'xpert-1',
      requesterId: 'user-1',
      status: XpertAccessRequestStatusEnum.APPROVED
    })

    service.rejectRequest('request-2', { response: 'Rejected' }).subscribe()
    const rejectRequest = httpMock.expectOne('/api/xpert-access-requests/request-2/reject')
    expect(rejectRequest.request.method).toBe('PUT')
    expect(rejectRequest.request.body).toEqual({
      response: 'Rejected'
    })
    rejectRequest.flush({
      id: 'request-2',
      xpertId: 'xpert-1',
      requesterId: 'user-2',
      status: XpertAccessRequestStatusEnum.REJECTED
    })
  })
})
