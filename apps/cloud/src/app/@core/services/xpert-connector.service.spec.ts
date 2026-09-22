import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'

jest.mock('@cloud/app/@core/state', () => ({
  API_PREFIX: '/api'
}))

import { XpertConnectorService } from './xpert-connector.service'

describe('XpertConnectorService OAuth browser binding', () => {
  let service: XpertConnectorService
  let httpMock: HttpTestingController

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [XpertConnectorService]
    })
    service = TestBed.inject(XpertConnectorService)
    httpMock = TestBed.inject(HttpTestingController)
  })

  afterEach(() => {
    httpMock.verify()
  })

  it('accepts the OAuth browser cookie when connecting a workspace provider', () => {
    const input = { authMethodId: 'oauth2' }
    service.connect('workspace-1', 'notion', input).subscribe()

    const request = httpMock.expectOne('/api/connector/workspace-1/notion/connect')
    expect(request.request.method).toBe('POST')
    expect(request.request.body).toEqual(input)
    expect(request.request.withCredentials).toBe(true)
    request.flush({ status: 'pending' })
  })

  it('accepts the OAuth browser cookie when connecting an existing binding', () => {
    const input = { authMethodId: 'oauth2', xpertId: 'assistant-1' }
    service.connectBinding('binding-1', input).subscribe()

    const request = httpMock.expectOne('/api/connector/bindings/binding-1/connect')
    expect(request.request.method).toBe('POST')
    expect(request.request.body).toEqual(input)
    expect(request.request.withCredentials).toBe(true)
    request.flush({ status: 'pending' })
  })
})
