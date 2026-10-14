import { inject } from '@angular/core'
import { CanActivateFn, Router } from '@angular/router'
import { UserType } from '@xpert-ai/contracts'
import { filter, map, take } from 'rxjs'
import { Store } from '../../../../@core'

export const personalApiKeysAccountGate: CanActivateFn = () => {
  const router = inject(Router)
  return inject(Store).user$.pipe(
    filter((user) => !!user),
    take(1),
    map((user) => (user.type === UserType.USER ? true : router.createUrlTree(['/settings/account/profile'])))
  )
}
