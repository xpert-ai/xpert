import { provideHttpClient } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { firstValueFrom } from 'rxjs'
import { McpRuntimeService } from './mcp-runtime.service'

describe('MCP runtime searchable collection', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] }))
  it('continues using its request offset even if the server omits offset, and stops at total', async () => {
    const result = firstValueFrom(TestBed.inject(McpRuntimeService).listAll({ status: 'all' }))
    const http = TestBed.inject(HttpTestingController)
    http.expectOne((request) => request.params.get('offset') === '0').flush({ items: [{ id: 'first' }], total: 2 })
    http.expectOne((request) => request.params.get('offset') === '1').flush({ items: [{ id: 'second' }], total: 2 })
    expect((await result).map((item) => item.id)).toEqual(['first', 'second'])
    http.verify()
  })
  it('cancels in-flight pages when the search scope changes', () => {
    const subscription = TestBed.inject(McpRuntimeService).listAll().subscribe()
    const request = TestBed.inject(HttpTestingController).expectOne((request) => request.params.get('offset') === '0')
    subscription.unsubscribe()
    expect(request.cancelled).toBe(true)
    TestBed.inject(HttpTestingController).verify()
  })
})
