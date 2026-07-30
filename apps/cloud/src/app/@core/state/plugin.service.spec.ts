import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { of } from 'rxjs'
import { PluginAPIService } from './plugin.service'
import { Store } from './store.service'

describe('PluginAPIService', () => {
  let service: PluginAPIService
  let httpMock: HttpTestingController

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        PluginAPIService,
        {
          provide: Store,
          useValue: {
            selectOrganizationId: () => of(null)
          }
        }
      ]
    })

    service = TestBed.inject(PluginAPIService)
    httpMock = TestBed.inject(HttpTestingController)
  })

  afterEach(() => {
    httpMock.verify()
  })

  it('loads the public marketplace through the Xpert backend', () => {
    const next = jest.fn()

    service.getPublicMarketplace({ targetApp: 'xpert' }).subscribe(next)

    const request = httpMock.expectOne(
      (candidate) => candidate.url === '/api/plugin/marketplace/public' && candidate.params.get('targetApp') === 'xpert'
    )

    expect(request.request.method).toBe('GET')

    const response = {
      updatedAt: null,
      total: 0,
      items: [],
      sources: []
    }
    request.flush(response)

    expect(next).toHaveBeenCalledWith(response)
  })
})
