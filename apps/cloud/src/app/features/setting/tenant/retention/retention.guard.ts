import { inject } from '@angular/core'
import { CanActivateFn, Router } from '@angular/router'
import { catchError, map, of } from 'rxjs'
import { TenantService } from '../../../../@core'

export const tenantRetentionGuard: CanActivateFn = () => {
  const router = inject(Router)
  const redirect = router.createUrlTree(['/settings/tenant/settings'])
  return inject(TenantService)
    .canManageRetention()
    .pipe(
      map((allowed) => (allowed ? true : redirect)),
      catchError(() => of(redirect))
    )
}
