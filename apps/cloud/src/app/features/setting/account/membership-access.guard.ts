import { inject } from '@angular/core'
import { CanActivateFn, Router } from '@angular/router'
import { map, take } from 'rxjs'
import { MembershipService } from '../../../@core'

export const membershipPlanAccountGate: CanActivateFn = () => {
  const router = inject(Router)

  return inject(MembershipService)
    .hasActiveMembershipInScope()
    .pipe(
      take(1),
      map((hasActiveMembership) => (hasActiveMembership ? true : router.createUrlTree(['/settings/account/profile'])))
    )
}
