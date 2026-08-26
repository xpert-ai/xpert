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

  it('requests draft-aware slot views only when explicitly enabled', () => {
    service.getSlotViews('agent', 'assistant/1', 'agent.workbench.fixed', { isDraft: true }).subscribe()

    const request = httpMock.expectOne(
      'http://localhost:3000/api/view-hosts/agent/assistant%2F1/slots/agent.workbench.fixed/views?isDraft=true'
    )
    expect(request.request.method).toBe('GET')
    request.flush([])
  })

  it('keeps slot view discovery published by default', () => {
    service.getSlotViews('agent', 'assistant-1', 'agent.workbench.fixed').subscribe()

    const request = httpMock.expectOne(
      'http://localhost:3000/api/view-hosts/agent/assistant-1/slots/agent.workbench.fixed/views'
    )
    expect(request.request.method).toBe('GET')
    request.flush([])
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
