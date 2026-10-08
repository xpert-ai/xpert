import { HttpClient, HttpParams } from '@angular/common/http'
import { TestBed } from '@angular/core/testing'
import { of } from 'rxjs'
import { ModelGatewayUsageChannelEnum, ModelUsageLedgerQuery } from '@xpert-ai/contracts'
import { CopilotUsageService } from './copilot-usage.service'

describe('CopilotUsageService execution queries', () => {
  let service: CopilotUsageService
  const get = jest.fn()
  beforeEach(() => {
    get.mockReset().mockReturnValue(of({ items: [], total: 0 }))
    TestBed.configureTestingModule({ providers: [CopilotUsageService, { provide: HttpClient, useValue: { get } }] })
    service = TestBed.inject(CopilotUsageService)
  })
  afterEach(() => TestBed.resetTestingModule())
  it('omits whitespace-only optional filters and uses bounded pagination parameters', () => {
    service.getExecutionCalls(20, 0, { tool: '  ', model: ' model ', entry: 'cli' }).subscribe()
    const params: HttpParams = get.mock.calls[0][1].params
    expect(params.has('tool')).toBe(false)
    expect(params.get('model')).toBe('model')
    expect(params.get('entry')).toBe('cli')
    expect(params.get('take')).toBe('20')
    expect(params.get('skip')).toBe('0')
  })
  it('uses identical execution filters for ledger rows, account totals and model breakdowns', () => {
    const query: ModelUsageLedgerQuery = {
      usageChannel: ModelGatewayUsageChannelEnum.AgentRuntime,
      environmentType: 'sandbox',
      assistantId: 'assistant',
      conversationId: 'conversation',
      executionId: 'invocation',
      tool: 'custom-cli'
    }
    service.getModelUsageLedger(query).subscribe()
    service.getModelUsageAccounts(query).subscribe()
    service.getModelUsageBreakdown('model', query).subscribe()
    for (const [, options] of get.mock.calls) {
      const params: HttpParams = options.params
      for (const [key, value] of Object.entries(query)) expect(params.get(key)).toBe(value)
    }
  })
})
