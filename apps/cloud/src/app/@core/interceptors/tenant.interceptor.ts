import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { RequestScopeLevel } from '@metad/contracts'
import { Observable } from 'rxjs'
import { RequestMethodEnum } from '../types'
import { Store } from './../services/store.service'

@Injectable()
export class TenantInterceptor implements HttpInterceptor {
  constructor(private store: Store) {}

  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
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
