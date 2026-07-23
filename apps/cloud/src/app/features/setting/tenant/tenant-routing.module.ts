import { NgModule } from '@angular/core'
import { RouterModule, Routes } from '@angular/router'
import { NgxPermissionsGuard } from 'ngx-permissions'
import { AiFeatureEnum, FeatureEnum, PermissionsEnum, RolesEnum } from '../../../@core'
import { SMTPComponent } from '../../../@shared/smtp/smtp.component'
import { featureGate } from '../../feature-gate'
import { SettingsComponent } from './settings/settings.component'
import { PACTenantComponent } from './tenant.component'
import { TenantTagMaintainComponent } from './maintain/maintain.component'

export function redirectTo() {
  return '/dashboard'
}

const routes: Routes = [
  {
    path: '',
    component: PACTenantComponent,
    canActivate: [NgxPermissionsGuard],
    data: {
      scopeContext: 'tenant-only',
      permissions: {
        only: [RolesEnum.SUPER_ADMIN],
        redirectTo
      }
    },
    children: [
      {
        path: '',
        redirectTo: 'settings',
        pathMatch: 'full'
      },
      {
        path: 'settings',
        component: SettingsComponent
      },
      {
        path: 'skills',
        loadComponent: () => import('./skills/skills.component').then((m) => m.TenantSkillsComponent),
        data: {
          title: 'settings/tenant/skills'
        }
      },
      {
        path: 'tags',
        component: TenantTagMaintainComponent
      },
      {
        path: 'retention',
        loadComponent: () => import('./retention/retention.component').then((m) => m.TenantRetentionComponent),
        data: {
          title: 'settings/tenant/retention'
        }
      },
      {
        path: 'membership',
        loadComponent: () => import('./membership/membership.component').then((m) => m.TenantMembershipComponent),
        canActivate: [featureGate([AiFeatureEnum.FEATURE_MEMBERSHIP_PLAN], ['/settings/tenant/settings'])],
        data: {
          title: 'settings/tenant/membership'
        }
      },
      {
        path: 'smtp',
        component: SMTPComponent,
        canActivate: [NgxPermissionsGuard, featureGate([FeatureEnum.FEATURE_SMTP], ['/settings/tenant/settings'])],
        data: {
          title: 'settings/tenant/smtp',
          scopeContext: 'tenant-only',
          isOrganization: false,
          permissions: {
            only: [PermissionsEnum.CUSTOM_SMTP_VIEW],
            redirectTo
          },
          selectors: {
            project: false,
            employee: false,
            date: false,
            organization: false
          }
        }
      }
    ]
  }
]

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class TenantRoutingModule {}
