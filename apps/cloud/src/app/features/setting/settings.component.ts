import { ChangeDetectionStrategy, Component, computed, inject, model } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { RouterModule } from '@angular/router'
import { injectI18nService } from '@cloud/app/@shared/i18n'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { NgxPermissionsService, NgxRolesService } from 'ngx-permissions'
import { distinctUntilChanged } from 'rxjs/operators'
import { RequestScopeLevel, Store, routeAnimations } from '../../@core'
import { AppService } from '../../app.service'
import { ZardIconComponent, ZardTooltipImports } from '@xpert-ai/headless-ui'
import { getSettingsMenuItems } from '../menus'

@Component({
  standalone: true,
  imports: [RouterModule, ...ZardTooltipImports, ZardIconComponent, TranslateModule, NgmCommonModule],
  selector: 'pac-settings',
  templateUrl: `settings.component.html`,
  styleUrl: './settings.component.css',
  animations: [routeAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PACSettingComponent {
  private readonly rolesService = inject(NgxRolesService)
  private readonly permissionsService = inject(NgxPermissionsService)
  private readonly store = inject(Store)
  readonly i18nService = injectI18nService()
  readonly appService = inject(AppService)

  readonly isMobile = this.appService.isMobile
  readonly sideMenuOpened = model(!this.isMobile())
  readonly selectedOrganization = toSignal(this.store.selectedOrganization$)
  readonly activeScope = toSignal(this.store.selectActiveScope(), {
    initialValue: this.store.activeScope
  })
  readonly permissions = toSignal(this.permissionsService.permissions$.pipe(distinctUntilChanged()))
  readonly scopeTranslations = toSignal(this.i18nService.stream('PAC.Scope'))
  readonly scopeIcon = computed(() =>
    this.activeScope().level === RequestScopeLevel.TENANT ? 'storage' : 'corporate_fare'
  )
  readonly scopeTitle = computed(() => this.scopeTranslations()?.Current ?? 'Current Scope')
  readonly scopeLabel = computed(() =>
    this.activeScope().level === RequestScopeLevel.TENANT
      ? this.scopeTranslations()?.TenantEyebrow ?? 'Tenant Console'
      : this.scopeTranslations()?.OrganizationEyebrow ?? 'Organization Scope'
  )
  readonly scopeDescription = computed(() =>
    this.activeScope().level === RequestScopeLevel.TENANT
      ? this.scopeTranslations()?.TenantLabel ?? 'Tenant defaults and governance'
      : this.selectedOrganization()?.name ||
        this.scopeTranslations()?.SelectOrganization ||
        'Select an organization'
  )
  readonly scopeTooltip = computed(() => `${this.scopeTitle()}: ${this.scopeLabel()} - ${this.scopeDescription()}`)

  readonly menus = computed(() => {
    const scopeLevel = this.activeScope().level
    this.permissions()

    return getSettingsMenuItems(scopeLevel)
      .filter((item) => {
        if (item.data?.featureKey) {
          const featureKey = Array.isArray(item.data.featureKey) ? item.data.featureKey : [item.data.featureKey]
          if (!featureKey.every((key) => this.store.hasFeatureEnabled(key))) {
            return false
          }
        }
        if (item.data?.permissionKeys) {
          const anyPermission = item.data.permissionKeys
            ? item.data.permissionKeys.reduce((permission, key) => {
                return !!this.rolesService.getRole(key) || !!this.permissionsService.getPermission(key) || permission
              }, false)
            : true
          return anyPermission
        }
        return true
      })
      .map((item) => ({
        ...item,
        link: item.path
      }))
  })
}
