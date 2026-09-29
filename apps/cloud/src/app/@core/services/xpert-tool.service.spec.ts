import { HttpErrorResponse } from '@angular/common/http'
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { NGXLogger } from 'ngx-logger'
import { firstValueFrom, of } from 'rxjs'
import { Store } from '../state'
import { getErrorMessage } from '../types'
import { XpertToolService } from './xpert-tool.service'

describe('XpertToolService test errors', () => {
  let service: XpertToolService
  let httpMock: HttpTestingController

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        { provide: Store, useValue: { selectOrganizationId: () => of('organization-1') } },
        { provide: NGXLogger, useValue: {} }
      ]
    })
    service = TestBed.inject(XpertToolService)
    httpMock = TestBed.inject(HttpTestingController)
  })

  afterEach(() => httpMock.verify())

  it.each([
    [400, 'Bad Request', '1047 (08S01): Unsupported command(Change user)'],
    [403, 'Forbidden', 'Access denied']
  ])('exposes the message from a text-encoded HTTP %i error', async (status, statusText, message) => {
    const result = firstValueFrom(service.test({ name: 'ping' })).catch((error: unknown) => error)
    const request = httpMock.expectOne((item) => item.url.endsWith('/xpert-tool/test'))
    expect(request.request.responseType).toBe('text')
    request.flush(JSON.stringify({ statusCode: status, message }), {
      status,
      statusText,
      headers: { 'x-request-id': 'request-1' }
    })

    const failure = await result
    expect(failure).toBeInstanceOf(HttpErrorResponse)
    if (!(failure instanceof HttpErrorResponse)) throw failure
    expect(failure.status).toBe(status)
    expect(failure.headers.get('x-request-id')).toBe('request-1')
    expect(failure.error).toEqual({ statusCode: status, message })
    expect(getErrorMessage(failure)).toBe(message)
  })

  it.each(['Upstream connection refused', '{invalid json', 'null', '{"details":"no message"}'])(
    'preserves an error body without a structured message: %s',
    async (body) => {
      const result = firstValueFrom(service.test({ name: 'ping' })).catch((error: unknown) => error)
      httpMock
        .expectOne((item) => item.url.endsWith('/xpert-tool/test'))
        .flush(body, {
          status: 502,
          statusText: 'Bad Gateway'
        })

      const failure = await result
      expect(failure).toBeInstanceOf(HttpErrorResponse)
      if (!(failure instanceof HttpErrorResponse)) throw failure
      expect(failure.error).toBe(body)
    }
  )

  it('preserves successful tool output as text', async () => {
    const result = firstValueFrom(service.test({ name: 'ping' }))
    httpMock.expectOne((item) => item.url.endsWith('/xpert-tool/test')).flush('{"ok":true}')

    await expect(result).resolves.toBe('{"ok":true}')
  })
})
