import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest, HttpResponse } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { Observable, tap } from 'rxjs'
import { API_PREFIX } from '../state/constants/app.constants'
import { invalidateCurrentUserDisplayCache } from '../state/current-user-session-cache'

const CURRENT_USER_RESOURCES = new Set([
  'user',
  'tenant',
  'organization',
  'user-organization',
  'roles',
  'role-permissions',
  'feature',
  'employee'
])

@Injectable()
export class CurrentUserCacheInvalidationInterceptor implements HttpInterceptor {
  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    // Register before APIInterceptor so matching uses the original relative API path.
    const resource = request.url.startsWith(`${API_PREFIX}/`)
      ? request.url.slice(API_PREFIX.length + 1).split(/[/?]/)[0]
      : null
    const invalidatesCurrentUser =
      resource && CURRENT_USER_RESOURCES.has(resource) && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)

    return next.handle(request).pipe(
      tap((event) => {
        if (invalidatesCurrentUser && event instanceof HttpResponse && event.ok) invalidateCurrentUserDisplayCache()
      })
    )
  }
}
