import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { DataSourceService, Store } from '@cloud/app/@core/state'
import { AuthenticationEnum } from '@xpert-ai/contracts'
import { ZardSheetService } from '@xpert-ai/headless-ui'
import { BehaviorSubject, of } from 'rxjs'
import { DataSourceConnectionService } from './data-source-connection.service'

describe('DataSourceConnectionService', () => {
  let service: DataSourceConnectionService
  let httpMock: HttpTestingController
  let sheetService: { open: jest.Mock }

  beforeEach(() => {
    sheetService = {
      open: jest.fn()
    }

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        DataSourceConnectionService,
        DataSourceService,
        {
          provide: Store,
          useValue: {
            selectOrganizationId: jest.fn(() => new BehaviorSubject<string | null>('org-1').asObservable())
          }
        },
        {
          provide: ZardSheetService,
          useValue: sheetService
        }
      ]
    })

    service = TestBed.inject(DataSourceConnectionService)
    httpMock = TestBed.inject(HttpTestingController)
  })

  afterEach(() => {
    httpMock.verify()
  })

  it('posts a new data source connection test through the REST API', async () => {
    const dataSource = {
      name: 'mysql-source'
    }

    const resultPromise = service.ping(dataSource)

    const request = httpMock.expectOne('/api/data-source/ping')
    expect(request.request.method).toBe('POST')
    expect(request.request.body).toEqual(dataSource)
    request.flush({ ok: true })

    await expect(resultPromise).resolves.toEqual({ ok: true })
  })

  it('posts an existing data source connection test through the REST API', async () => {
    const dataSource = {
      id: 'source-1',
      name: 'mysql-source'
    }

    const resultPromise = service.ping(dataSource)

    const request = httpMock.expectOne('/api/data-source/source-1/ping')
    expect(request.request.method).toBe('POST')
    expect(request.request.body).toEqual(dataSource)
    request.flush({ ok: true })

    await expect(resultPromise).resolves.toEqual({ ok: true })
  })

  it('adds prompted BASIC credentials to a new data source connection test', async () => {
    const authentication = {
      username: 'demo',
      password: 'secret',
      remeberMe: true
    }
    sheetService.open.mockReturnValue({
      afterClosed: () => of(authentication)
    })

    const resultPromise = service.ping({
      name: 'mysql-source',
      authType: AuthenticationEnum.BASIC
    })
    await new Promise((resolve) => setTimeout(resolve))

    const request = httpMock.expectOne('/api/data-source/ping')
    expect(request.request.body.authentications).toEqual([authentication])
    request.flush({ ok: true })

    await expect(resultPromise).resolves.toEqual({ ok: true })
    expect(sheetService.open).toHaveBeenCalledTimes(1)
  })

  it('reuses saved BASIC credentials for an existing data source', async () => {
    const resultPromise = service.ping({
      id: 'source-1',
      name: 'mysql-source',
      authType: AuthenticationEnum.BASIC
    })

    const authenticationRequest = httpMock.expectOne('/api/data-source/source-1/authentication')
    authenticationRequest.flush({
      username: 'demo',
      password: 'secret'
    })
    await new Promise((resolve) => setTimeout(resolve))

    const pingRequest = httpMock.expectOne('/api/data-source/source-1/ping')
    expect(pingRequest.request.body.authentications).toBeUndefined()
    pingRequest.flush({ ok: true })

    await expect(resultPromise).resolves.toEqual({ ok: true })
    expect(sheetService.open).not.toHaveBeenCalled()
  })
})
