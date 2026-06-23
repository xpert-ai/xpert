import { HttpEventType, HttpHandler, HttpRequest } from '@angular/common/http'
import { firstValueFrom, of } from 'rxjs'
import { AuthStrategy } from '../auth'
import { Store } from '../services/store.service'
import { TokenInterceptor } from './token.interceptor'

function createNextHandler() {
  let handledRequest: HttpRequest<unknown> | null = null
  const handle = jest.fn((request: HttpRequest<unknown>) => {
    handledRequest = request
    return of({ type: HttpEventType.Sent })
  })
  const next: HttpHandler = { handle }

  return {
    next,
    getHandledRequest() {
      if (!handledRequest) {
        throw new Error('Expected request to be handled')
      }

      return handledRequest
    }
  }
}

describe('TokenInterceptor', () => {
  it('does not add stale authorization headers to password login requests', async () => {
    const store = {
      token: 'old-token',
      refreshToken: 'refresh-token'
    } as Store
    const auth = {} as AuthStrategy
    const interceptor = new TokenInterceptor(store, auth)
    const { next, getHandledRequest } = createNextHandler()

    await firstValueFrom(interceptor.intercept(new HttpRequest('POST', '/api/auth/login'), next))

    expect(getHandledRequest().headers.has('Authorization')).toBe(false)
  })
})
