import { HttpHandler, HttpRequest, HttpResponse } from '@angular/common/http'
import { firstValueFrom, of } from 'rxjs'
import { APIInterceptor } from './api.interceptor'
import { currentUserSessionEpoch } from '../state/current-user-session-cache'

jest.mock('../providers', () => ({ injectApiBaseUrl: () => 'https://api.example.invalid' }))

describe('APIInterceptor', () => {
  it.each([
    ['/api/user/fixture', 'https://api.example.invalid/api/user/fixture'],
    ['https://elsewhere.invalid/api/user/fixture', 'https://elsewhere.invalid/api/user/fixture']
  ])('rewrites %s without invalidating user state', async (url, expectedUrl) => {
    const before = currentUserSessionEpoch()
    const handle = jest.fn((request: HttpRequest<unknown>) => of(new HttpResponse({ status: 200 })))
    const next: HttpHandler = { handle }
    await firstValueFrom(new APIInterceptor().intercept(new HttpRequest('PUT', url, {}), next))
    expect(handle.mock.calls[0][0].url).toBe(expectedUrl)
    expect(currentUserSessionEpoch()).toBe(before)
  })
})
