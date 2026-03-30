
import { ChangeDetectionStrategy, Component, computed, inject, model } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { RouterModule } from '@angular/router'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { NgxPermissionsService, NgxRolesService } from 'ngx-permissions'
import { distinctUntilChanged } from 'rxjs/operators'
import {
  AIPermissionsEnum,
  AiFeatureEnum,
  AnalyticsFeatures,
  AnalyticsPermissionsEnum,
  FeatureEnum,
  PermissionsEnum,
  RequestScopeLevel,
  RolesEnum,
  Store,
  routeAnimations
} from '../../@core'
import { AppService } from '../../app.service'
import { ZardIconComponent, ZardTooltipImports } from '@xpert-ai/headless-ui'
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
  readonly appService = inject(AppService)

  readonly isMobile = this.appService.isMobile
  readonly sideMenuOpened = model(!this.isMobile())
  readonly selectedOrganization = toSignal(this.store.selectedOrganization$)
  readonly activeScope = toSignal(this.store.selectActiveScope(), {
    initialValue: this.store.activeScope
  })
  readonly permissions = toSignal(this.permissionsService.permissions$.pipe(distinctUntilChanged()))

  readonly menus = computed(() => {
    const organization = this.selectedOrganization()
    const scopeLevel = this.activeScope().level
    const permissions = this.permissions()

    const menus = [
      {
        link: 'account',
        label: 'Account',
        icon: 'account_circle'
      },
      {
        link: 'copilot',
        label: 'AI Copilot',
        icon: 'psychology',
        scopeContext: 'dual-scope',
        data: {
          featureKey: AiFeatureEnum.FEATURE_COPILOT,
          permissionKeys: [AIPermissionsEnum.COPILOT_EDIT]
        }
      },
      // {
      //   link: 'knowledgebase',
      //   label: 'Knowledgebase',
      //   icon: 'school',
      //   data: {
      //     featureKey: [
      //       AiFeatureEnum.FEATURE_COPILOT,
      //       AiFeatureEnum.FEATURE_COPILOT_KNOWLEDGEBASE
      //     ],
      //     permissionKeys: [RolesEnum.SUPER_ADMIN, RolesEnum.ADMIN]
      //   }
      // },
      {
        link: 'data-sources',
        label: 'Data Sources',
        icon: 'database',
        scopeContext: 'organization-only',
        data: {
          permissionKeys: [AnalyticsPermissionsEnum.DATA_SOURCE_EDIT],
          featureKey: AnalyticsFeatures.FEATURE_MODEL
        }
      },
      {
        link: 'assistants',
        label: 'Assistants',
        icon: 'robot_2',
        scopeContext: 'dual-scope',
        subtitleKey:
          scopeLevel === RequestScopeLevel.TENANT
            ? 'PAC.Assistant.MenuTenantSubtitle'
            : 'PAC.Assistant.MenuOrganizationSubtitle',
        subtitleDefault:
          scopeLevel === RequestScopeLevel.TENANT
            ? 'Tenant defaults'
            : 'Organization overrides',
        data: {
          featureKey: AiFeatureEnum.FEATURE_XPERT,
          permissionKeys: [RolesEnum.SUPER_ADMIN, RolesEnum.ADMIN]
        }
      },
      {
        link: 'chatbi',
        label: 'Chat BI',
        icon: 'try',
        scopeContext: 'dual-scope',
        data: {
          permissionKeys: [AnalyticsPermissionsEnum.MODELS_EDIT],
          featureKey: [AiFeatureEnum.FEATURE_XPERT, AnalyticsFeatures.FEATURE_MODEL]
        }
      },
      {
        link: 'business-area',
        label: 'Business Area',
        icon: 'business_center',
        scopeContext: 'organization-only',
        data: {
          featureKey: AnalyticsFeatures.FEATURE_BUSINESS_AREA,
          permissionKeys: [AnalyticsPermissionsEnum.BUSINESS_AREA_EDIT]
        }
      },
      {
        link: 'certification',
        label: 'Certification',
        icon: 'verified_user',
        scopeContext: 'organization-only',
        data: {
          permissionKeys: [AnalyticsPermissionsEnum.CERTIFICATION_EDIT]
          // permissionKeys: [AnalyticsPermissionsEnum.CERTIFICATION_EDIT]
        }
      },
      {
        link: 'integration',
        label: 'System Integration',
        icon: 'hub',
        scopeContext: 'organization-only',
        data: {
          featureKey: FeatureEnum.FEATURE_INTEGRATION,
          permissionKeys: [PermissionsEnum.INTEGRATION_EDIT]
        }
      },
      {
        link: 'users',
        label: 'User',
        icon: 'people',
        scopeContext: 'tenant-only',
        data: {
          featureKey: FeatureEnum.FEATURE_USER,
          permissionKeys: [PermissionsEnum.ORG_USERS_EDIT]
        }
      },
      {
        link: 'roles',
        label: 'Role & Permission',
        icon: 'supervisor_account',
        scopeContext: 'tenant-only',
        data: {
          featureKey: FeatureEnum.FEATURE_ROLES_PERMISSION,
          permissionKeys: [PermissionsEnum.CHANGE_ROLES_PERMISSIONS]
        }
      },

      {
        link: 'email-templates',
        label: 'Email Template',
        icon: 'email',
        scopeContext: 'dual-scope',
        data: {
          featureKey: FeatureEnum.FEATURE_EMAIL_TEMPLATE,
          permissionKeys: [PermissionsEnum.VIEW_ALL_EMAIL_TEMPLATES]
        }
      },
      {
        link: 'custom-smtp',
        label: 'Custom SMTP',
        icon: 'alternate_email',
        scopeContext: 'dual-scope',
        data: {
          featureKey: FeatureEnum.FEATURE_SMTP,
          permissionKeys: [PermissionsEnum.CUSTOM_SMTP_VIEW]
        }
      },

      {
        link:
          scopeLevel === RequestScopeLevel.TENANT
            ? 'features/tenant'
            : 'features/organization',
        label: 'Feature',
        icon: 'widgets',
        scopeContext: 'dual-scope',
        data: {
          permissionKeys: [PermissionsEnum.CHANGE_ROLES_PERMISSIONS]
        }
      },
      {
        link: 'organizations',
        label: 'Organization',
        icon: 'corporate_fare',
        scopeContext: 'tenant-only',
        data: {
          permissionKeys: [RolesEnum.SUPER_ADMIN]
        }
      },
      {
        link: 'plugins',
        label: 'Plugins',
        icon: 'extension',
        scopeContext: 'dual-scope',
        data: {
          permissionKeys: [RolesEnum.SUPER_ADMIN, RolesEnum.ADMIN, RolesEnum.TRIAL]
        }
      }
    ]

    if (scopeLevel === RequestScopeLevel.TENANT) {
      menus.push({
        link: 'tenant',
        label: 'Tenant',
        icon: 'computer',
        scopeContext: 'tenant-only',
        data: {
          permissionKeys: [RolesEnum.SUPER_ADMIN]
        }
      })
    }

    return menus.filter((item: any) => {
      const scopeContext = item.scopeContext ?? 'dual-scope'
      if (
        (scopeContext === 'tenant-only' && scopeLevel !== RequestScopeLevel.TENANT) ||
        (scopeContext === 'organization-only' &&
          scopeLevel !== RequestScopeLevel.ORGANIZATION)
      ) {
        return false
      }
      if (item.data?.featureKey) {
        const featureKey = Array.isArray(item.data.featureKey) ? item.data.featureKey : [item.data.featureKey]
        if (!featureKey.every((key) => this.store.hasFeatureEnabled(key))) {
          return false
        }
      }
      if (item.data?.permissionKeys) {
        const anyPermission = item.data.permissionKeys
          ? item.data.permissionKeys.reduce((permission, key) => {
              return this.rolesService.getRole(key) || this.permissionsService.getPermission(key) || permission
            }, false)
          : true
        return anyPermission
      }
      return true
    })
  })
}
