import { ChangeDetectionStrategy, Component, computed, inject, model } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { NgxPermissionsService, NgxRolesService } from 'ngx-permissions'
import { distinctUntilChanged } from 'rxjs/operators'
import {
  AIPermissionsEnum,
  AiFeatureEnum,
  AnalyticsFeatures,
  AnalyticsPermissionsEnum,
  FeatureEnum,
  PermissionsEnum,
  RolesEnum,
  Store,
  routeAnimations
} from '../../@core'
import { AppService } from '../../app.service'
import { CommonModule } from '@angular/common'
import { RouterModule } from '@angular/router'
import { MatTooltipModule } from '@angular/material/tooltip'
import { TranslateModule } from '@ngx-translate/core'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { MatIconModule } from '@angular/material/icon'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatTooltipModule,
    MatIconModule,
    TranslateModule,
    NgmCommonModule
  ],
  selector: 'pac-settings',
  templateUrl: `settings.component.html`,
  styleUrl: './settings.component.scss',
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
  readonly permissions = toSignal(this.permissionsService.permissions$.pipe(distinctUntilChanged()))

  readonly menus = computed(() => {
    const organization = this.selectedOrganization()
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
        data: {
          featureKey: AiFeatureEnum.FEATURE_COPILOT,
          permissionKeys: [AIPermissionsEnum.COPILOT_EDIT]
        }
      },
      {
        link: 'knowledgebase',
        label: 'Knowledgebase',
        icon: 'school',
        data: {
          featureKey: AiFeatureEnum.FEATURE_COPILOT_KNOWLEDGEBASE,
          permissionKeys: [
            RolesEnum.SUPER_ADMIN,
            RolesEnum.ADMIN
          ]
        }
      },
      {
        link: 'data-sources',
        label: 'Data Sources',
        icon: 'topic',
        data: {
          permissionKeys: [AnalyticsPermissionsEnum.DATA_SOURCE_EDIT]
        }
      },
      {
        link: 'chatbi',
        label: 'Chat BI',
        icon: 'mms',
        data: {
          permissionKeys: [AIPermissionsEnum.XPERT_EDIT],
          featureKey: AiFeatureEnum.FEATURE_XPERT
        }
      },
      {
        link: 'business-area',
        label: 'Business Area',
        icon: 'business_center',
        data: {
          featureKey: AnalyticsFeatures.FEATURE_BUSINESS_AREA,
          permissionKeys: [AnalyticsPermissionsEnum.BUSINESS_AREA_EDIT]
        }
      },
      {
        link: 'certification',
        label: 'Certification',
        icon: 'verified_user',
        data: {
          permissionKeys: [AnalyticsPermissionsEnum.CERTIFICATION_EDIT]
          // permissionKeys: [AnalyticsPermissionsEnum.CERTIFICATION_EDIT]
        }
      },
      {
        link: 'integration',
        label: 'Integration',
        icon: 'hub',
        data: {
          featureKey: FeatureEnum.FEATURE_INTEGRATION,
          permissionKeys: [PermissionsEnum.INTEGRATION_EDIT]
        }
      },
      {
        link: 'users',
        label: 'User',
        icon: 'people',
        data: {
          featureKey: FeatureEnum.FEATURE_USER,
          permissionKeys: [PermissionsEnum.ORG_USERS_EDIT]
        }
      },
      {
        link: 'roles',
        label: 'Role & Permission',
        icon: 'supervisor_account',
        data: {
          featureKey: FeatureEnum.FEATURE_ROLES_PERMISSION,
          permissionKeys: [PermissionsEnum.CHANGE_ROLES_PERMISSIONS]
        }
      },

      {
        link: 'email-templates',
        label: 'Email Template',
        icon: 'email',
        data: {
          featureKey: FeatureEnum.FEATURE_EMAIL_TEMPLATE,
          permissionKeys: [PermissionsEnum.VIEW_ALL_EMAIL_TEMPLATES]
        }
      },
      {
        link: 'custom-smtp',
        label: 'Custom SMTP',
        icon: 'alternate_email',
        data: {
          featureKey: FeatureEnum.FEATURE_SMTP,
          permissionKeys: [PermissionsEnum.CUSTOM_SMTP_VIEW]
        }
      },

      {
        link: 'features',
        label: 'Feature',
        icon: 'widgets',
        data: {
          permissionKeys: [RolesEnum.SUPER_ADMIN]
        }
      },
      {
        link: 'organizations',
        label: 'Organization',
        icon: 'corporate_fare',
        data: {
          permissionKeys: [RolesEnum.SUPER_ADMIN]
        }
      },
      {
        link: 'plugins',
        label: 'Plugins',
        icon: 'extension',
        data: {
          permissionKeys: [RolesEnum.SUPER_ADMIN, RolesEnum.ADMIN, RolesEnum.TRIAL]
        }
      }
    ]

    if (!organization) {
      menus.push({
        link: 'tenant',
        label: 'Tenant',
        icon: 'tenancy',
        data: {
          permissionKeys: [RolesEnum.SUPER_ADMIN]
        }
      })
    }

    return menus.filter((item: any) => {
      if (item.data?.featureKey) {
        if (!this.store.hasFeatureEnabled(item.data.featureKey)) {
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
