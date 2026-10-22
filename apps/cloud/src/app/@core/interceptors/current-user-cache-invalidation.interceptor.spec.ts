import { HTTP_INTERCEPTORS, HttpClient, HttpHandler, HttpRequest, HttpResponse } from '@angular/common/http'
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { firstValueFrom, of, throwError } from 'rxjs'
import { APIInterceptor } from './api.interceptor'
import { CurrentUserCacheInvalidationInterceptor } from './current-user-cache-invalidation.interceptor'
import { currentUserSessionEpoch } from '../state/current-user-session-cache'

jest.mock('../providers', () => ({ injectApiBaseUrl: () => 'https://api.example.invalid' }))

describe('CurrentUserCacheInvalidationInterceptor', () => {
  it.each(['user', 'organization', 'user-organization', 'roles', 'role-permissions', 'feature', 'tenant', 'employee'])(
    'invalidates after a successful %s mutation',
    async (resource) => {
      const before = currentUserSessionEpoch()
      const handle = jest.fn((request: HttpRequest<unknown>) => of(new HttpResponse({ status: 200 })))
      const next: HttpHandler = { handle }
      await firstValueFrom(
        new CurrentUserCacheInvalidationInterceptor().intercept(
          new HttpRequest('PATCH', `/api/${resource}/fixture`, {}),
          next
        )
      )
      expect(currentUserSessionEpoch()).toBe(before + 1)
      expect(handle.mock.calls[0][0].url).toBe(`/api/${resource}/fixture`)
    }
  )

  it('does not invalidate reads, unrelated resources, external URLs, or failed writes', async () => {
    const interceptor = new CurrentUserCacheInvalidationInterceptor()
    const next: HttpHandler = { handle: () => of(new HttpResponse({ status: 200 })) }
    const before = currentUserSessionEpoch()
    await firstValueFrom(interceptor.intercept(new HttpRequest('GET', '/api/user/me'), next))
    await firstValueFrom(interceptor.intercept(new HttpRequest('POST', '/api/xpert', {}), next))
    await firstValueFrom(interceptor.intercept(new HttpRequest('PUT', 'https://elsewhere.invalid/api/user', {}), next))
    await expect(
      firstValueFrom(
        interceptor.intercept(new HttpRequest('PUT', '/api/organization/fixture', {}), {
          handle: () => throwError(() => new Error('failed mutation'))
        })
      )
    ).rejects.toThrow('failed mutation')
    expect(currentUserSessionEpoch()).toBe(before)
  })

  it('invalidates only after success through the registered URL-rewriting chain', async () => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        { provide: HTTP_INTERCEPTORS, useClass: CurrentUserCacheInvalidationInterceptor, multi: true },
        { provide: HTTP_INTERCEPTORS, useClass: APIInterceptor, multi: true }
      ]
    })
    const http = TestBed.inject(HttpClient)
    const backend = TestBed.inject(HttpTestingController)
    const before = currentUserSessionEpoch()
    const response = firstValueFrom(http.patch('/api/role-permissions/fixture', { enabled: false }))
    const request = backend.expectOne('https://api.example.invalid/api/role-permissions/fixture')
    expect(currentUserSessionEpoch()).toBe(before)
    request.flush({ enabled: false })
    expect(await response).toEqual({ enabled: false })
    expect(currentUserSessionEpoch()).toBe(before + 1)
    backend.verify()
  })
})
