import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'

jest.mock('@xpert-ai/cloud/state', () => ({
  API_PREFIX: '/api'
}))

jest.mock('./fetch-event-source', () => ({
  injectFetchEventSource: () => jest.fn()
}))

import { SandboxService } from './sandbox.service'

describe('SandboxService', () => {
  let service: SandboxService
  let httpMock: HttpTestingController

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [SandboxService]
    })

    service = TestBed.inject(SandboxService)
    httpMock = TestBed.inject(HttpTestingController)
  })

  afterEach(() => {
    httpMock.verify()
  })

  it('creates preview sessions with credentials so the preview cookie can be stored', () => {
    service.createManagedServicePreviewSession('conversation-1', 'service-1').subscribe()

    const request = httpMock.expectOne(
      'http://localhost:3000/api/sandbox/conversations/conversation-1/services/service-1/preview-session'
    )

    expect(request.request.method).toBe('POST')
    expect(request.request.withCredentials).toBe(true)

    request.flush({
      expiresAt: '2026-04-21T00:00:00.000Z',
      previewUrl: '/api/sandbox/conversations/conversation-1/services/service-1/proxy/'
    })
  })
})
