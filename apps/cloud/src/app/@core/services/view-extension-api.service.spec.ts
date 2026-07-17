import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { ViewExtensionApiService } from './view-extension-api.service'

describe('ViewExtensionApiService', () => {
  let service: ViewExtensionApiService
  let httpMock: HttpTestingController

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [ViewExtensionApiService]
    })
    service = TestBed.inject(ViewExtensionApiService)
    httpMock = TestBed.inject(HttpTestingController)
  })

  afterEach(() => {
    httpMock.verify()
  })

  it('accepts the HttpOnly cookie returned when creating a view file session', () => {
    service.createViewFileAccessSession('assistant', 'assistant-1', 'cut-workbench').subscribe()

    const request = httpMock.expectOne('http://localhost:3000/api/workspace-files/view-sessions')
    expect(request.request.method).toBe('POST')
    expect(request.request.withCredentials).toBe(true)
    expect(request.request.body).toEqual({
      hostType: 'assistant',
      hostId: 'assistant-1',
      viewKey: 'cut-workbench'
    })
    request.flush({ sessionId: 'session-1', expiresAt: '2026-07-17T04:00:00.000Z' })
  })

  it('sends the view file session cookie when revoking a session', () => {
    service.revokeViewFileAccessSession('session/1').subscribe()

    const request = httpMock.expectOne('http://localhost:3000/api/workspace-files/view-sessions/session%2F1')
    expect(request.request.method).toBe('DELETE')
    expect(request.request.withCredentials).toBe(true)
    request.flush({ success: true })
  })
})
