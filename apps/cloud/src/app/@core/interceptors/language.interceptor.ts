import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { TranslateService } from '@ngx-translate/core'
import { Observable } from 'rxjs'
import { Store } from './../services/store.service'

@Injectable()
export class LanguageInterceptor implements HttpInterceptor {
  constructor(
    private store: Store,
    private translate: TranslateService
  ) {}

  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const language =
      this.store && this.store.preferredLanguage ? this.store.preferredLanguage : this.translate.getBrowserLang()

    request = request.clone({
      setHeaders: {
        Language: language,
        'Time-Zone': Intl.DateTimeFormat().resolvedOptions().timeZone
      }
    })

    return next.handle(request)
  }
}
