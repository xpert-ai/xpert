import { Injectable, computed, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { NgxPermissionsService, NgxRolesService } from 'ngx-permissions'
import { distinctUntilChanged } from 'rxjs'
import { AiFeatureEnum, AIPermissionsEnum, Store, UserType } from '../../@core'
import { getSettingsMenuItems } from '../menus'
import { buildSettingsNavigation } from './settings-navigation'

/** Shared authorization for the sidebar panel and the settings page breadcrumbs. */
@Injectable({ providedIn: 'root' })
export class SettingsNavigationService {
  private readonly rolesService = inject(NgxRolesService)
  private readonly permissionsService = inject(NgxPermissionsService)
  private readonly store = inject(Store)
  readonly user = toSignal(this.store.user$, { initialValue: this.store.user })
  readonly activeScope = toSignal(this.store.selectActiveScope(), { initialValue: this.store.activeScope })
  readonly permissions = toSignal(this.permissionsService.permissions$.pipe(distinctUntilChanged()))
  readonly rolePermissions = toSignal(this.store.userRolePermissions$)
  readonly featureContextHydrated = toSignal(this.store.featureContextHydrated$, {
    initialValue: this.store.featureContextHydrated
  })
  readonly menus = computed(() => {
    const scopeLevel = this.activeScope().level
    this.permissions()
    this.rolePermissions()
    const featureContextHydrated = this.featureContextHydrated()

    return getSettingsMenuItems(scopeLevel).filter((item) => {
      if (item.data?.featureKey && featureContextHydrated) {
        const featureKey = Array.isArray(item.data.featureKey) ? item.data.featureKey : [item.data.featureKey]
        if (!featureKey.every((key) => this.store.hasFeatureEnabled(key))) return false
      }
      if (item.data?.permissionKeys) {
        return item.data.permissionKeys.some(
          (key) => !!this.rolesService.getRole(key) || !!this.permissionsService.getPermission(key)
        )
      }
      return true
    })
  })

  readonly groups = computed(() => {
    this.rolePermissions()
    this.featureContextHydrated()
    const regularUser = this.user()?.type !== UserType.COMMUNICATION
    return buildSettingsNavigation(this.menus(), {
      membership: this.store.hasPermission(AIPermissionsEnum.MEMBERSHIP_USE),
      models: regularUser,
      personalApiKeys: this.user()?.type === UserType.USER,
      gateway:
        regularUser &&
        this.store.hasFeatureEnabled(AiFeatureEnum.FEATURE_MODEL_GATEWAY) &&
        this.store.hasPermission(AIPermissionsEnum.MODEL_GATEWAY_USE)
    })
  })
}
