import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { API_PREFIX } from '@metad/cloud/state'
import { Observable } from 'rxjs'
import { injectApiBaseUrl } from '../providers'

@Injectable()
export class APIInterceptor implements HttpInterceptor {
  readonly baseUrl = injectApiBaseUrl()

  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    if (this.baseUrl && request.url.startsWith(`${API_PREFIX}`)) {
      const url = this.baseUrl + request.url
      request = request.clone({
        url: url
      })
    }
    return next.handle(request)
  }
}
