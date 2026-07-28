import { inject } from '@angular/core'
import { CanActivateFn, Router } from '@angular/router'
import { AiFeatureEnum, AIPermissionsEnum, UserType } from '@xpert-ai/contracts'
import { map, take } from 'rxjs'
import { MembershipService, Store } from '../../../@core'
import { hydrateFeatureContext } from '../../feature-gate'

export const membershipPlanAccountGate: CanActivateFn = () => {
  const router = inject(Router)

  return inject(MembershipService)
    .hasActiveMembershipInScope()
    .pipe(
      take(1),
      map((hasActiveMembership) => (hasActiveMembership ? true : router.createUrlTree(['/settings/account/profile'])))
    )
}

export const modelAccessAccountGate: CanActivateFn = () => {
  const router = inject(Router)

  return inject(Store).user$.pipe(
    take(1),
    map((user) => (user?.type === UserType.COMMUNICATION ? router.createUrlTree(['/settings/account/profile']) : true))
  )
}

export const modelGatewayAccountGate: CanActivateFn = () => {
  const router = inject(Router)
  const store = inject(Store)

  return hydrateFeatureContext({ skipSessionCache: true }).pipe(
    map(() =>
      store.hasFeatureEnabled(AiFeatureEnum.FEATURE_MODEL_GATEWAY) &&
      store.user?.type !== UserType.COMMUNICATION &&
      store.hasPermission(AIPermissionsEnum.MODEL_GATEWAY_USE)
        ? true
        : router.createUrlTree(['/settings/account/profile'])
    )
  )
}
