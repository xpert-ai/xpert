import { inject } from '@angular/core'
import { Router } from '@angular/router'
import { map } from 'rxjs/operators'
import { TenantService } from '../services'

export function onboardGuard() {
  const tenantService = inject(TenantService)
  const router = inject(Router)
  return tenantService.getOnboard().pipe(
    // can onboard or navigate to home
    map((onboard) => {
      if (onboard.tenant) {
        router.navigate(['/home/'])
        return false
      } else if (onboard.error) {
        router.navigate(['/onboarding/unknown'])
        return false
      }
      return true
    })
  )
}
