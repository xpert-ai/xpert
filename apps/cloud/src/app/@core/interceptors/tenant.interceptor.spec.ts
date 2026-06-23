import { HttpEventType, HttpHandler, HttpRequest } from '@angular/common/http'
import { RequestScopeLevel } from '@xpert-ai/contracts'
import { firstValueFrom, of } from 'rxjs'
import { Store } from '../services/store.service'
import { TenantInterceptor } from './tenant.interceptor'

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

describe('TenantInterceptor', () => {
  it('does not add tenant scope headers to password login requests', async () => {
    const store = {
      user: { tenantId: 'tenant-1' },
      activeScope: { level: RequestScopeLevel.ORGANIZATION, organizationId: 'org-1' }
    } as Store
    const interceptor = new TenantInterceptor(store)
    const { next, getHandledRequest } = createNextHandler()

    await firstValueFrom(interceptor.intercept(new HttpRequest('POST', '/api/auth/login'), next))

    const handledRequest = getHandledRequest()
    expect(handledRequest.headers.has('Tenant-Id')).toBe(false)
    expect(handledRequest.headers.has('X-Scope-Level')).toBe(false)
    expect(handledRequest.headers.has('Organization-Id')).toBe(false)
  })
})
