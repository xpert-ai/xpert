import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import type { TXpertProjectAccessSummary } from '@xpert-ai/contracts'
import { XpertProjectApiService } from './project-api.service'

describe('XpertProjectApiService', () => {
  let service: XpertProjectApiService
  let httpMock: HttpTestingController

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] })
    service = TestBed.inject(XpertProjectApiService)
    httpMock = TestBed.inject(HttpTestingController)
  })

  afterEach(() => httpMock.verify())

  it('loads the current user access summary for a Project', () => {
    let result: TXpertProjectAccessSummary | undefined
    service.access('project-1').subscribe((access) => (result = access))

    const request = httpMock.expectOne('/api/xpert-project/project-1/access')
    expect(request.request.method).toBe('GET')
    request.flush({
      role: 'member',
      capabilities: { canRead: true, canEdit: false, canManage: false, canUse: true }
    })

    expect(result).toEqual({
      role: 'member',
      capabilities: { canRead: true, canEdit: false, canManage: false, canUse: true }
    })
  })
})
