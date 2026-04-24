import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { RequestScopeLevel } from '@xpert-ai/contracts'
import { Observable } from 'rxjs'
import { RequestMethodEnum } from '../types'
import { isPublicXpertRequest } from '../utils/public-xpert-request'
import { Store } from './../services/store.service'

const ANONYMOUS_AUTH_PATHS = new Set([
  '/api/auth/sso/providers',
  '/api/auth/sso/bind/challenge',
  '/api/auth/sso/bind/complete',
  '/api/auth/sso/bind/register',
  '/api/tenant/onboard'
])

@Injectable()
export class TenantInterceptor implements HttpInterceptor {
  constructor(private store: Store) {}

  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    if (isAnonymousAuthRequest(request.url) || isPublicXpertRequest(request.method, request.url)) {
      return next.handle(request)
    }

    const tenantId = this.store.user?.tenantId
    const activeScope = this.store.activeScope

    if (tenantId && request.method === RequestMethodEnum.DELETE) {
      request = request.clone({
        setParams: {
          tenantId
        }
      })
    }

    request = request.clone({
      setHeaders: {
        ...(tenantId ? { 'Tenant-Id': `${tenantId}` } : {}),
        'X-Scope-Level': activeScope.level
      }
    })

    if (activeScope.level === RequestScopeLevel.ORGANIZATION) {
      request = request.clone({
        setHeaders: {
          'Organization-Id': `${activeScope.organizationId}`
        }
      })
    }

    return next.handle(request)
  }
}

function isAnonymousAuthRequest(url: string): boolean {
  try {
    return ANONYMOUS_AUTH_PATHS.has(new URL(url, 'http://localhost').pathname)
  } catch {
    return false
  }
}
