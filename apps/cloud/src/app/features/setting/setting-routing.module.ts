import { NgModule } from '@angular/core'
import { RouterModule, Routes } from '@angular/router'
import { NgxPermissionsGuard } from 'ngx-permissions'
import { AnalyticsPermissionsEnum, PermissionsEnum, RolesEnum } from '../../@core'
import { redirectTo } from '../features-routing.module'
import { PACAccountComponent } from './account/account.component'
import { PACAccountPasswordComponent } from './account/password.component'
import { PACAccountProfileComponent } from './account/profile.component'
import { PACSettingComponent } from './settings.component'

const routes: Routes = [
  {
    path: '',
    component: PACSettingComponent,
    data: { title: 'pac.menu.settings' },
    children: [
      {
        path: '',
        redirectTo: 'account',
        pathMatch: 'full'
      },
      {
        path: 'account',
        component: PACAccountComponent,
        data: {
          title: 'settings/account'
        },
        children: [
          {
            path: '',
            redirectTo: 'profile',
            pathMatch: 'full'
          },
          {
            path: 'profile',
            component: PACAccountProfileComponent,
            data: {
              title: 'settings/account/profile'
            }
          },
          {
            path: 'password',
            component: PACAccountPasswordComponent,
            data: {
              title: 'settings/account/password'
            }
          }
        ]
      },
      {
        path: 'data-sources',
        loadChildren: () => import('./data-sources/routing').then((m) => m.default),
        canActivate: [ NgxPermissionsGuard ],
        data: {
          title: 'settings/data-sources',
          permissions: {
            only: [AnalyticsPermissionsEnum.DATA_SOURCE_EDIT],
            redirectTo
          }
        }
      },
      {
        path: 'users',
        loadChildren: () => import('./users/user.module').then((m) => m.UserModule),
        canActivate: [NgxPermissionsGuard],
        data: {
          title: 'settings/users',
          permissions: {
            only: [PermissionsEnum.ORG_USERS_VIEW],
            redirectTo
          }
        }
      },
      {
        path: 'business-area',
        loadChildren: () => import('./business-area/').then((m) => m.routes),
        canActivate: [NgxPermissionsGuard],
        data: {
          title: 'settings/business-area',
          permissions: {
            only: [AnalyticsPermissionsEnum.BUSINESS_AREA_EDIT],
            redirectTo
          }
        }
      },
      {
        path: 'certification',
        loadChildren: () => import('./certification/certification.module').then((m) => m.CertificationModule),
        canActivate: [NgxPermissionsGuard],
        data: {
          title: 'settings/certification',
          permissions: {
            only: [AnalyticsPermissionsEnum.BUSINESS_AREA_EDIT],
            // only: [AnalyticsPermissionsEnum.CERTIFICATION_EDIT],
            redirectTo
          }
        }
      },

      {
        path: 'notification-destinations',
        loadChildren: () =>
          import('./notification-destination/notification-destination.module').then(
            (m) => m.NotificationDestinationModule
          ),
        canActivate: [NgxPermissionsGuard],
        data: {
          title: 'settings/notification-destinations',
          permissions: {
            only: [AnalyticsPermissionsEnum.BUSINESS_AREA_EDIT],
            redirectTo
          }
        }
      },

      {
        path: 'roles',
        loadChildren: () => import('./roles/roles.module').then((m) => m.RolesModule),
        canActivate: [NgxPermissionsGuard],
        data: {
          title: 'settings/roles',
          permissions: {
            only: [PermissionsEnum.CHANGE_ROLES_PERMISSIONS],
            redirectTo
          }
        }
      },
      {
        path: 'features',
        loadChildren: () => import('./features/routing').then((m) => m.default),
        data: {
          title: 'settings/features',
          permissions: {
            only: [RolesEnum.SUPER_ADMIN],
            redirectTo
          }
        },
        canActivate: [NgxPermissionsGuard],
      },
      {
        path: 'tenant',
        loadChildren: () => import('./tenant/tenant.module').then((m) => m.TenantModule),
        data: {
          title: 'settings/tenant'
        }
      },
      {
        path: 'organizations',
        loadChildren: () => import('./organizations/organizations.module').then((m) => m.OrganizationsModule),
        data: {
          title: 'settings/organizations'
        }
      },
      {
        path: 'email-templates',
        loadChildren: () => import('./email-templates/routing').then((m) => m.default),
        data: {
          title: 'settings/email-templates'
        }
      },
      {
        path: 'custom-smtp',
        loadChildren: () => import('./custom-smtp/custom-smtp.module').then((m) => m.CustomSmtpModule),
        data: {
          title: 'settings/custom-smtp'
        }
      },
      {
        path: 'copilot',
        loadChildren: () => import('./copilot/routing').then((m) => m.default),
        data: {
          title: 'settings/copilot'
        }
      },
      {
        path: 'chatbi',
        loadChildren: () => import('./chatbi/routing').then((m) => m.default),
        data: {
          title: 'settings/chatbi'
        }
      },
      {
        path: 'knowledgebase',
        loadChildren: () => import('./knowledgebase/routing').then((m) => m.default),
        data: {
          title: 'settings/knowledgebase'
        }
      },
      {
        path: 'integration',
        loadChildren: () => import('./integration/routing').then((m) => m.default),
        data: {
          title: 'settings/integration',
          permissions: {
            only: [PermissionsEnum.INTEGRATION_EDIT],
            redirectTo
          }
        },
        canActivate: [NgxPermissionsGuard]
      }
    ]
  }
]

@NgModule({
  declarations: [],
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class SettingRoutingModule {}
