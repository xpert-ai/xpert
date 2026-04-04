import { NgModule } from '@angular/core'
import { RouterModule, Routes } from '@angular/router'
import { NgxPermissionsGuard } from 'ngx-permissions'
import { AIPermissionsEnum, AnalyticsPermissionsEnum, PermissionsEnum, RolesEnum } from '../../@core'
import { redirectTo } from '../features-routing.module'
import { PACAccountComponent } from './account/account.component'
import { PACAccountPasswordComponent } from './account/password.component'
import { PACAccountProfileComponent } from './account/profile.component'
import { PACSettingComponent } from './settings.component'
import { PluginsComponent } from './plugins/plugins.component'

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
          title: 'settings/account',
          scopeContext: 'dual-scope'
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
              title: 'settings/account/profile',
              scopeContext: 'dual-scope'
            }
          },
          {
            path: 'password',
            component: PACAccountPasswordComponent,
            data: {
              title: 'settings/account/password',
              scopeContext: 'dual-scope'
            }
          }
        ]
      },
      {
        path: 'data-sources',
        loadChildren: () => import('./data-sources/routing').then((m) => m.default),
        canActivate: [NgxPermissionsGuard],
        data: {
          title: 'settings/data-sources',
          scopeContext: 'dual-scope',
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
          scopeContext: 'dual-scope',
          permissions: {
            only: [
              PermissionsEnum.ALL_ORG_VIEW,
              PermissionsEnum.ALL_ORG_EDIT,
              PermissionsEnum.ORG_USERS_VIEW,
              PermissionsEnum.ORG_USERS_EDIT
            ],
            redirectTo
          }
        }
      },
      {
        path: 'invites',
        redirectTo: 'users',
        pathMatch: 'full'
      },
      {
        path: 'groups',
        loadChildren: () => import('./groups/routing').then((m) => m.default),
        canActivate: [NgxPermissionsGuard],
        data: {
          title: 'settings/groups',
          scopeContext: 'organization-only',
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
          scopeContext: 'organization-only',
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
          scopeContext: 'organization-only',
          permissions: {
            only: [AnalyticsPermissionsEnum.BUSINESS_AREA_EDIT],
            // only: [AnalyticsPermissionsEnum.CERTIFICATION_EDIT],
            redirectTo
          }
        }
      },

      // {
      //   path: 'notification-destinations',
      //   loadChildren: () =>
      //     import('./notification-destination/notification-destination.module').then(
      //       (m) => m.NotificationDestinationModule
      //     ),
      //   canActivate: [NgxPermissionsGuard],
      //   data: {
      //     title: 'settings/notification-destinations',
      //     permissions: {
      //       only: [AnalyticsPermissionsEnum.BUSINESS_AREA_EDIT],
      //       redirectTo
      //     }
      //   }
      // },

      {
        path: 'roles',
        loadChildren: () => import('./roles/roles.module').then((m) => m.RolesModule),
        canActivate: [NgxPermissionsGuard],
        data: {
          title: 'settings/roles',
          scopeContext: 'tenant-only',
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
          scopeContext: 'dual-scope',
          permissions: {
            only: [PermissionsEnum.CHANGE_ROLES_PERMISSIONS],
            redirectTo
          }
        },
        canActivate: [NgxPermissionsGuard]
      },
      {
        path: 'tenant',
        loadChildren: () => import('./tenant/tenant.module').then((m) => m.TenantModule),
        data: {
          title: 'settings/tenant',
          scopeContext: 'tenant-only'
        }
      },
      {
        path: 'organizations',
        loadChildren: () => import('./organizations/organizations.module').then((m) => m.OrganizationsModule),
        canActivate: [NgxPermissionsGuard],
        data: {
          title: 'settings/organizations',
          scopeContext: 'dual-scope',
          permissions: {
            only: [
              PermissionsEnum.ALL_ORG_VIEW,
              PermissionsEnum.ALL_ORG_EDIT,
              PermissionsEnum.ORG_USERS_VIEW,
              PermissionsEnum.ORG_USERS_EDIT
            ],
            redirectTo
          }
        }
      },
      {
        path: 'email-templates',
        loadChildren: () => import('./email-templates/routing').then((m) => m.default),
        data: {
          title: 'settings/email-templates',
          scopeContext: 'dual-scope'
        }
      },
      {
        path: 'custom-smtp',
        loadChildren: () => import('./custom-smtp/custom-smtp.module').then((m) => m.CustomSmtpModule),
        data: {
          title: 'settings/custom-smtp',
          scopeContext: 'dual-scope'
        }
      },
      {
        path: 'copilot',
        loadChildren: () => import('./copilot/routing').then((m) => m.default),
        data: {
          title: 'settings/copilot',
          scopeContext: 'dual-scope'
        }
      },
      {
        path: 'chatbi',
        loadChildren: () => import('./chatbi/routing').then((m) => m.default),
        data: {
          title: 'settings/chatbi',
          scopeContext: 'dual-scope'
        }
      },
      {
        path: 'assistants',
        loadChildren: () => import('./assistants/routing').then((m) => m.default),
        canActivate: [NgxPermissionsGuard],
        data: {
          title: 'settings/assistants',
          scopeContext: 'dual-scope',
          permissions: {
            only: [RolesEnum.SUPER_ADMIN, RolesEnum.ADMIN],
            redirectTo
          }
        }
      },
      {
        path: 'knowledgebase',
        loadChildren: () => import('./knowledgebase/routing').then((m) => m.default),
        canActivate: [NgxPermissionsGuard],
        data: {
          title: 'settings/knowledgebase',
          scopeContext: 'organization-only',
          permissions: {
            only: [AIPermissionsEnum.KNOWLEDGEBASE_EDIT],
            redirectTo
          }
        }
      },
      {
        path: 'integration',
        loadChildren: () => import('./integration/routing').then((m) => m.default),
        canActivate: [NgxPermissionsGuard],
        data: {
          title: 'settings/integration',
          scopeContext: 'dual-scope',
          permissions: {
            only: [PermissionsEnum.INTEGRATION_EDIT],
            redirectTo
          }
        }
      },
      {
        path: 'plugins',
        component: PluginsComponent,
        canActivate: [NgxPermissionsGuard],
        data: {
          title: 'settings/plugins',
          scopeContext: 'dual-scope',
          permissions: {
            only: [RolesEnum.SUPER_ADMIN, RolesEnum.ADMIN, RolesEnum.TRIAL],
            redirectTo
          }
        }
      },
      {
        path: 'skill-repository',
        loadChildren: () => import('./skill-repository').then((m) => m.routes),
        canActivate: [NgxPermissionsGuard],
        data: {
          title: 'settings/skill-repository',
          permissions: {
            only: [RolesEnum.SUPER_ADMIN],
            redirectTo
          }
        }
      },
    ]
  }
]

@NgModule({
  declarations: [],
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class SettingRoutingModule {}
