import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { of } from 'rxjs'

import { Store } from '../state'
import { BusinessAreaService } from './business-area.service'

describe('BusinessAreaService', () => {
  let httpMock: HttpTestingController
  let service: BusinessAreaService

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        {
          provide: Store,
          useValue: {
            selectOrganizationId: () => of('organization-1')
          }
        }
      ]
    })

    httpMock = TestBed.inject(HttpTestingController)
    service = TestBed.inject(BusinessAreaService)
  })

  afterEach(() => {
    httpMock.verify()
  })

  it('creates business area master data through the xpert-pro API', () => {
    service.create({ name: 'Finance', parentId: null }).subscribe()

    const request = httpMock.expectOne((item) => item.method === 'POST' && item.url.endsWith('/business-area'))
    expect(request.request.body).toEqual({ name: 'Finance', parentId: null })
    request.flush({ id: 'area-1', name: 'Finance', parentId: null })
  })

  it('updates the name and hierarchy through the xpert-pro API', () => {
    service.update('area-1', { name: 'Corporate Finance', parentId: 'area-root' }).subscribe()

    const request = httpMock.expectOne((item) => item.method === 'PUT' && item.url.endsWith('/business-area/area-1'))
    expect(request.request.body).toEqual({ name: 'Corporate Finance', parentId: 'area-root' })
    request.flush({ id: 'area-1', name: 'Corporate Finance', parentId: 'area-root' })
  })
})
