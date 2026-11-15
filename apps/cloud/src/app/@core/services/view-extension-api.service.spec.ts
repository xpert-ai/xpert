// Keep the HTTP tests on the real URL provider without loading unrelated auth/service barrels.
jest.mock('../providers', () => jest.requireActual('../providers/url'))

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

    const request = httpMock.expectOne('http://localhost:3000/api/ai/workspace-files/view-sessions')
    expect(request.request.method).toBe('POST')
    expect(request.request.withCredentials).toBe(true)
    expect(request.request.body).toEqual({
      hostType: 'assistant',
      hostId: 'assistant-1',
      viewKey: 'cut-workbench'
    })
    request.flush({ sessionId: 'session-1', expiresAt: '2026-07-17T04:00:00.000Z' })
  })

  it('binds a view file session to the current Project runtime scope', () => {
    service
      .createViewFileAccessSession('agent', 'assistant-1', 'docx-editor', {
        projectId: 'project-1',
        conversationId: 'conversation-1'
      })
      .subscribe()

    const request = httpMock.expectOne('http://localhost:3000/api/ai/workspace-files/view-sessions')
    expect(request.request.method).toBe('POST')
    expect(request.request.withCredentials).toBe(true)
    expect(request.request.headers.get('X-Xpert-View-Project-Id')).toBe('project-1')
    expect(request.request.headers.get('X-Xpert-View-Conversation-Id')).toBe('conversation-1')
    expect(request.request.body).toEqual({
      hostType: 'agent',
      hostId: 'assistant-1',
      viewKey: 'docx-editor',
      runtimeScope: {
        projectId: 'project-1',
        conversationId: 'conversation-1'
      }
    })
    request.flush({ sessionId: 'session-1', expiresAt: '2026-07-17T04:00:00.000Z' })
  })

  it('sends the view file session cookie when revoking a session', () => {
    service.revokeViewFileAccessSession('session/1').subscribe()

    const request = httpMock.expectOne('http://localhost:3000/api/ai/workspace-files/view-sessions/session%2F1')
    expect(request.request.method).toBe('DELETE')
    expect(request.request.withCredentials).toBe(true)
    request.flush({ success: true })
  })

  it('reads grant bytes through the authenticated runtime API with the current project scope', () => {
    const bytes = new Blob(['image bytes'], { type: 'image/png' })
    const received = jest.fn()
    service
      .readViewFileAccessContent(
        'session-1',
        {
          url: '/api/workspace-files/content/session-1/grant-1/image.png',
          fileName: 'image.png',
          mimeType: 'image/png',
          expiresAt: '2099-01-01T00:00:00Z'
        },
        { projectId: 'project-1', conversationId: 'conversation-1' }
      )
      .subscribe(received)
    const request = httpMock.expectOne(
      'http://localhost:3000/api/ai/workspace-files/view-sessions/session-1/grants/grant-1/content/image.png'
    )
    expect(request.request.responseType).toBe('blob')
    expect(request.request.headers.get('X-Xpert-View-Project-Id')).toBe('project-1')
    expect(request.request.headers.get('X-Xpert-View-Conversation-Id')).toBe('conversation-1')
    request.flush(bytes)
    expect(received).toHaveBeenCalledWith(bytes)
  })

  it('requests the server draft binding within the current project and conversation', () => {
    service
      .getLocalDraftBinding('agent', 'assistant/1', 'editor/1', 'resource/1', {
        projectId: 'project-1',
        conversationId: 'conversation-1'
      })
      .subscribe()
    const request = httpMock.expectOne(
      'http://localhost:3000/api/view-hosts/agent/assistant%2F1/views/editor%2F1/local-draft-binding?resourceId=resource/1'
    )
    expect(request.request.method).toBe('GET')
    expect(request.request.headers.get('X-Xpert-View-Project-Id')).toBe('project-1')
    expect(request.request.headers.get('X-Xpert-View-Conversation-Id')).toBe('conversation-1')
    expect(request.request.params.keys()).toEqual(['resourceId'])
    request.flush({ resourceId: 'resource/1', scopeKey: 'server-owned-scope' })
  })

  it('keeps group draft access on the group-authorized route and propagates denial', () => {
    const denied = jest.fn()
    service
      .getLocalDraftBinding('agent', 'assistant-1', 'editor', 'resource-1', {
        groupId: 'group/1',
        projectId: 'project-1',
        conversationId: 'conversation-1'
      })
      .subscribe({ error: denied })
    const request = httpMock.expectOne(
      'http://localhost:3000/api/ai/groups/group%2F1/workbench/agent/assistant-1/views/editor/local-draft-binding?resourceId=resource-1'
    )
    request.flush({ message: 'Denied' }, { status: 403, statusText: 'Forbidden' })
    expect(denied).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }))
  })
})
