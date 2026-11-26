import { inject } from '@angular/core'
import { CanActivateFn } from '@angular/router'
import { firstValueFrom } from 'rxjs'
import { z } from 'zod/v3'
import { Store } from '../../@core/state'
import { OrganizationsService } from '../../@core/services/organizations.service'

// Desktop links carry an organization hint. Resolve current access before selecting it.
export const projectEntryScopeGuard: CanActivateFn = async (route) => {
  const store = inject(Store)
  const organizations = inject(OrganizationsService)
  const hint = route.queryParamMap.get('organizationId')
  if (!hint || hint === store.organizationId) return true
  if (!z.string().uuid().safeParse(hint).success) return false
  try {
    const organization = await firstValueFrom(organizations.getById(hint))
    if (organization.isActive === false) return false
    store.clearScopedSelections()
    store.setOrganizationScope(organization)
    return true
  } catch {
    return false
  }
}
