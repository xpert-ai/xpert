import { Component } from '@angular/core'
import { catchError, concatMap, EMPTY, Observable, tap } from 'rxjs'
import { TenantService, Store, ToastrService } from '../../../../@core'
import { TranslationBaseComponent } from '../../../../@shared/language'
import { effectAction } from '@metad/ocap-angular/core'

@Component({
  selector: 'pac-tenant-demo',
  templateUrl: 'demo.component.html',
  styles: [':host {display: block; padding-top: 1rem;}']
})
export class DemoComponent extends TranslationBaseComponent {
  constructor(
    private readonly tenantService: TenantService,
    private readonly store: Store,
    private readonly _toastrService: ToastrService
  ) {
    super()
  }

  readonly generate = effectAction((origin$: Observable<void>) => {
    return origin$.pipe(
      concatMap(() => {
        return this.tenantService.generateDemo(this.store.user.tenantId).pipe(
          catchError((err) => {
            this._toastrService.error('PAC.NOTES.TENANT.DEMO_GENERATE_ERROR')
            return EMPTY
          })
        )
      }),
      tap(() => {
        this._toastrService.success('PAC.NOTES.TENANT.DEMO_GENERATED')
      })
    )
  })
}
