import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { ViewExtensionApiService } from './view-extension-api.service'

describe('group Workbench view routing', () => {
  let api: ViewExtensionApiService
  let http: HttpTestingController
  const scope = { groupId: 'group/one', conversationId: 'runtime-one', projectId: 'project-one' }
  const base = 'http://localhost:3000/api/ai/groups/group%2Fone/workbench/agent/assistant%2Fone'

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule], providers: [ViewExtensionApiService] })
    api = TestBed.inject(ViewExtensionApiService)
    http = TestBed.inject(HttpTestingController)
  })
  afterEach(() => http.verify())

  it('keeps all view operations behind the group guards and preserves runtime headers', () => {
    api.getSlotViews('agent', 'assistant/one', 'agent.workbench', { runtimeScope: scope }).subscribe()
    api.getRemoteComponentEntry('agent', 'assistant/one', 'computer', scope).subscribe()
    api.getViewData('agent', 'assistant/one', 'computer', {}, scope).subscribe()
    api.getViewParameterOptions('agent', 'assistant/one', 'computer', 'target', {}, scope).subscribe()
    api
      .executeAction('agent', 'assistant/one', 'computer', 'connect', { input: { mode: 'observe' } }, scope)
      .subscribe()
    api
      .executeFileAction(
        'agent',
        'assistant/one',
        'computer',
        'upload',
        {
          file: { name: 'shared.txt', buffer: new ArrayBuffer(0) }
        },
        scope
      )
      .subscribe()
    for (const [path, method] of [
      ['slots/agent.workbench/views', 'GET'],
      ['views/computer/remote-component/entry', 'GET'],
      ['views/computer/data', 'GET'],
      ['views/computer/parameters/target/options', 'GET'],
      ['views/computer/actions/connect', 'POST'],
      ['views/computer/actions/upload/file', 'POST']
    ]) {
      const request = http.expectOne(`${base}/${path}`)
      expect(request.request.method).toBe(method)
      expect(request.request.headers.get('X-Xpert-View-Conversation-Id')).toBe('runtime-one')
      expect(request.request.headers.get('X-Xpert-View-Project-Id')).toBe('project-one')
      request.flush(path.endsWith('/entry') ? '<html></html>' : {})
    }
  })

  it.each([401, 403])('never retries a denied group action on the generic endpoint (HTTP %s)', (status) => {
    const rejected = jest.fn()
    api.executeAction('agent', 'assistant/one', 'computer', 'connect', {}, scope).subscribe({ error: rejected })
    http.expectOne(`${base}/views/computer/actions/connect`).flush(null, { status, statusText: 'Denied' })
    expect(rejected).toHaveBeenCalledWith(expect.objectContaining({ status }))
    http.expectNone(() => true)
  })

  it('keeps group routing even before a runtime conversation is present', () => {
    api.getViewData('agent', 'assistant/one', 'computer', {}, { groupId: scope.groupId }).subscribe()
    const request = http.expectOne(`${base}/views/computer/data`)
    expect(request.request.headers.has('X-Xpert-View-Conversation-Id')).toBe(false)
    request.flush({})
  })

  it('keeps private and Project views on the generic endpoint', () => {
    for (const runtimeScope of [undefined, { conversationId: 'personal' }, { projectId: 'project-one' }]) {
      api.getViewData('agent', 'assistant/one', 'computer', {}, runtimeScope).subscribe()
      const request = http.expectOne('http://localhost:3000/api/view-hosts/agent/assistant%2Fone/views/computer/data')
      expect(request.request.headers.get('X-Xpert-View-Conversation-Id')).toBe(runtimeScope?.conversationId ?? null)
      expect(request.request.headers.get('X-Xpert-View-Project-Id')).toBe(runtimeScope?.projectId ?? null)
      request.flush({})
    }
  })
})
