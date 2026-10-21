import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { NGXLogger } from 'ngx-logger'
import { of } from 'rxjs'
import { Store } from '../state/store.service'
import { XpertAgentService } from './xpert-agent.service'

jest.mock('./fetch-event-source', () => ({ injectFetchEventSource: () => jest.fn() }))

describe('middleware configuration requests', () => {
  let service: XpertAgentService
  let http: HttpTestingController

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        { provide: NGXLogger, useValue: {} },
        { provide: Store, useValue: { selectOrganizationId: () => of('org-1') } }
      ]
    })
    service = TestBed.inject(XpertAgentService)
    http = TestBed.inject(HttpTestingController)
  })
  afterEach(() => http.verify())

  it.each(
    [
      undefined,
      {},
      { allowedFinalProviders: ['workspace_script.query'] },
      null,
      '',
      false,
      0,
      [],
      { allowedFinalProviders: [] }
    ].map((options) => ({ options }))
  )('sends the same configuration for preview and tool tests: $options', ({ options }) => {
    service.getAgentMiddleware('LiveDashboard', options, 'assistant-1').subscribe()
    service.testAgentMiddlewareTool('LiveDashboard', 'dashboard_list_sources', options, {}, 'assistant-1').subscribe()
    const preview = http.expectOne('/api/xpert-agent/middlewares/LiveDashboard/tools')
    const test = http.expectOne('/api/xpert-agent/middlewares/LiveDashboard/tools/dashboard_list_sources/test')
    for (const request of [preview, test]) {
      expect(request.request.method).toBe('POST')
      expect(request.request.body.xpertId).toBe('assistant-1')
      expect(request.request.body.options).toEqual(options === undefined ? {} : options)
      request.flush({ tools: [] })
    }
  })
})
