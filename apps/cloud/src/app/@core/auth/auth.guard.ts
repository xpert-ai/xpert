import { inject } from '@angular/core'
import { ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot } from '@angular/router'
import { Store } from '@metad/cloud/state'
import { firstValueFrom } from 'rxjs'
import { AuthStrategy } from './auth-strategy.service'

export const authGuard: CanActivateFn = async (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  const router = inject(Router)
  const store = inject(Store)
  const authStrategy = inject(AuthStrategy)

  const isAuthenticated = !!store.token
  if (isAuthenticated) {
    // logged in so return true
    return true
  }

  // logout and clear local store before redirect to login page
  await firstValueFrom(authStrategy.logout())

  router.navigate(['/auth/login'], {
    queryParams: { returnUrl: state.url }
  })
  return false
}
