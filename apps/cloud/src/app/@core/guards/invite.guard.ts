import { inject } from '@angular/core'
import { ActivatedRouteSnapshot, Router } from '@angular/router'
import { PermissionsEnum } from '@xpert-ai/contracts'
import { combineLatest } from 'rxjs'
import { first, map, tap } from 'rxjs/operators'
import { Store } from './../services/store.service'

export function inviteGuard(route: ActivatedRouteSnapshot) {
  const store = inject(Store)
  const router = inject(Router)
  const expectedPermissions: PermissionsEnum[] = route.data.expectedPermissions
  return combineLatest([
    store.userRolePermissions$.pipe(
      first(),
      map(() => expectedPermissions.some((permission) => store.hasPermission(permission)))
    ),
    store.selectedOrganization$.pipe(
      first(),
      map((organization) => organization?.invitesAllowed)
    )
  ]).pipe(
    map(([hasPermission, invitesAllowed]) => invitesAllowed && hasPermission),
    tap((allowed) => allowed || router.navigate(['/']))
  )
}
