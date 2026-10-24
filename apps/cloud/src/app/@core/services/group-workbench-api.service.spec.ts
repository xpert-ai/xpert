import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { GroupWorkbenchApiService } from './group-workbench-api.service'

describe('GroupWorkbenchApiService', () => {
  let api: GroupWorkbenchApiService
  let http: HttpTestingController

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] })
    api = TestBed.inject(GroupWorkbenchApiService)
    http = TestBed.inject(HttpTestingController)
  })
  afterEach(() => http.verify())

  it('resolves the server-authorized group runtime through the dedicated context endpoint', () => {
    const received = jest.fn()
    api.getContext('group/one').subscribe(received)
    const request = http.expectOne('http://localhost:3000/api/ai/groups/group%2Fone/workbench/context')
    expect(request.request.method).toBe('GET')
    const context = { assistantId: 'assistant', conversationId: 'shared-runtime', projectId: 'project' }
    request.flush(context)
    expect(received).toHaveBeenCalledWith(context)
  })

  it.each([401, 403])('propagates HTTP %s without resolving a personal runtime', (status) => {
    const received = jest.fn()
    const rejected = jest.fn()
    api.getContext('group').subscribe({ next: received, error: rejected })
    http.expectOne('http://localhost:3000/api/ai/groups/group/workbench/context').flush(null, {
      status,
      statusText: 'Denied'
    })
    expect(received).not.toHaveBeenCalled()
    expect(rejected).toHaveBeenCalledWith(expect.objectContaining({ status }))
    http.expectNone(() => true)
  })
})
