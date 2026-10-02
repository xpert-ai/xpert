import { HTTP_INTERCEPTORS, HttpClient } from '@angular/common/http'
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { ActivatedRoute } from '@angular/router'
import { AuthService } from '@cloud/app/@core/state'
import { RequestScopeLevel } from '@xpert-ai/contracts'
import { CookieService } from 'ngx-cookie-service'
import { firstValueFrom, of } from 'rxjs'
import { artifactShareSessionUrl } from '../../artifacts/artifact-share-session'
import { APIInterceptor } from '../interceptors/api.interceptor'
import { TenantInterceptor } from '../interceptors/tenant.interceptor'
import { TokenInterceptor } from '../interceptors/token.interceptor'
import { Store } from '../services/store.service'
import { AuthStrategy } from './auth-strategy.service'

describe('AuthStrategy logout cleanup', () => {
  const revokeUrl = 'http://localhost:3000/api/model-execution/revoke-mine'
  let strategy: AuthStrategy
  let http: HttpTestingController
  let store: {
    token: string | null
    refreshToken: string | null
    user: { tenantId: string } | null
    activeScope: { level: RequestScopeLevel; organizationId: string }
    serverConnection: number
    clear: jest.Mock
  }
  let authService: { logout: jest.Mock; refreshAccessToken: jest.Mock }

  beforeEach(() => {
    store = {
      token: 'access-fixture',
      refreshToken: 'refresh-fixture',
      user: { tenantId: 'tenant-fixture' },
      activeScope: { level: RequestScopeLevel.ORGANIZATION, organizationId: 'org-fixture' },
      serverConnection: 503,
      clear: jest.fn(() => {
        store.token = null
        store.refreshToken = null
        store.user = null
      })
    }
    authService = {
      logout: jest.fn(),
      refreshAccessToken: jest.fn(() => of({ token: 'new-access-fixture', refreshToken: 'new-refresh-fixture' }))
    }
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        AuthStrategy,
        { provide: ActivatedRoute, useValue: {} },
        { provide: CookieService, useValue: {} },
        { provide: Store, useValue: store },
        { provide: AuthService, useValue: authService },
        { provide: HTTP_INTERCEPTORS, useClass: APIInterceptor, multi: true },
        { provide: HTTP_INTERCEPTORS, useClass: TenantInterceptor, multi: true },
        { provide: HTTP_INTERCEPTORS, useClass: TokenInterceptor, multi: true }
      ]
    })
    strategy = TestBed.inject(AuthStrategy)
    http = TestBed.inject(HttpTestingController)
  })

  afterEach(() => http.verify())

  it('clears the share cookie and local identity without revoking background execution grants', async () => {
    const result = firstValueFrom(strategy.logout())
    http.expectNone(revokeUrl)
    const cookie = http.expectOne((req) => req.url === artifactShareSessionUrl())
    expect(cookie.request.headers.get('Authorization')).toBe('Bearer access-fixture')
    expect(cookie.request.headers.get('Tenant-Id')).toBe('tenant-fixture')
    expect(cookie.request.method).toBe('DELETE')
    expect(cookie.request.withCredentials).toBe(true)
    expect(store.clear).not.toHaveBeenCalled()
    cookie.flush({})
    expect((await result).isSuccess()).toBe(true)
    expect(store.token).toBeNull()
    expect(store.refreshToken).toBeNull()
    expect(store.serverConnection).toBe(200)
    expect(authService.logout).toHaveBeenCalledTimes(1)
  })

  it.each([401, 404, 503])(
    'still clears local identity after HTTP %s without refreshing or retrying',
    async (status) => {
      const result = firstValueFrom(strategy.logout())
      http.expectNone(revokeUrl)
      http.expectOne((req) => req.url === artifactShareSessionUrl()).flush({}, { status, statusText: 'Cleanup failed' })
      expect((await result).isSuccess()).toBe(true)
      expect(store.clear).toHaveBeenCalledTimes(1)
      expect(authService.refreshAccessToken).not.toHaveBeenCalled()
      http.expectNone(() => true)
    }
  )

  it('cancels stalled cleanup after five seconds and completes local logout', async () => {
    jest.useFakeTimers()
    try {
      const result = firstValueFrom(strategy.logout())
      const pending = http.match(() => true)
      expect(pending).toHaveLength(1)
      expect(pending[0].request.url).toBe(artifactShareSessionUrl())
      await jest.advanceTimersByTimeAsync(4999)
      expect(store.clear).not.toHaveBeenCalled()
      await jest.advanceTimersByTimeAsync(1)
      expect((await result).isSuccess()).toBe(true)
      expect(pending.every((req) => req.cancelled)).toBe(true)
      expect(store.clear).toHaveBeenCalledTimes(1)
      expect(store.token).toBeNull()
    } finally {
      jest.useRealTimers()
    }
  })

  it('skips authenticated revocation when already signed out but still clears the share cookie', async () => {
    store.token = null
    store.refreshToken = null
    store.user = null
    const result = firstValueFrom(strategy.logout())
    http.expectNone(revokeUrl)
    http.expectOne((req) => req.url === artifactShareSessionUrl()).flush({})
    expect((await result).isSuccess()).toBe(true)
    expect(authService.refreshAccessToken).not.toHaveBeenCalled()
  })

  it('preserves token refresh for ordinary authenticated requests', async () => {
    const url = 'http://localhost:3000/api/example'
    const result = firstValueFrom(TestBed.inject(HttpClient).get('/api/example'))
    http.expectOne(url).flush({}, { status: 401, statusText: 'Expired' })
    const retry = http.expectOne(url)
    expect(authService.refreshAccessToken).toHaveBeenCalledTimes(1)
    expect(retry.request.headers.get('Authorization')).toBe('Bearer new-access-fixture')
    retry.flush({ ok: true })
    await expect(result).resolves.toEqual({ ok: true })
    expect(store.clear).not.toHaveBeenCalled()
  })
})
