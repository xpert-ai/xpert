import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http'
import { DestroyRef, Injectable, inject } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { IUser, IOrganization } from '@metad/contracts'
import { Observable } from 'rxjs'
import { combineLatestWith, filter } from 'rxjs/operators'
import { RequestMethodEnum } from '../types'
import { Store } from './../services/store.service'

@Injectable()
export class TenantInterceptor implements HttpInterceptor {
  readonly destroyRef = inject(DestroyRef)
  
  constructor(private store: Store) {}

  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    this.store.user$
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        filter((user) => !!user),
        combineLatestWith(this.store.selectedOrganization$)
      )
      .subscribe(([user, organization]: [IUser, IOrganization]) => {
        //bind tenantId for DELETE http method
        const tenantId = user.tenantId
        if (request.method === RequestMethodEnum.DELETE) {
          const params = { tenantId }
          request = request.clone({
            setParams: params
          })
        }

        request = request.clone({
          setHeaders: {
            'Tenant-Id': `${tenantId}`
          }
        })

        if (organization?.id) {
          request = request.clone({
            setHeaders: {
              'Organization-Id': `${organization.id}`
            }
          })
        }
      })
    
    return next.handle(request)
  }
}
