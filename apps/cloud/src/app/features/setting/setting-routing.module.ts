import { NgModule } from '@angular/core'
import { RouterModule, Routes } from '@angular/router'
import { NgxPermissionsGuard } from 'ngx-permissions'
import { AiFeatureEnum, AIPermissionsEnum, AnalyticsPermissionsEnum, PermissionsEnum, RolesEnum } from '../../@core'
import { featureGate } from '../feature-gate'
import { redirectTo } from '../features-routing.module'
import { PACAccountComponent } from './account/account.component'
import { PACAccountPasswordComponent } from './account/password.component'
import { PACAccountProfileComponent } from './account/profile.component'
import { PACSettingComponent } from './settings.component'

export const membershipPlanSettingsGate = featureGate([AiFeatureEnum.FEATURE_MEMBERSHIP_PLAN], ['/settings'])
export const membershipPlanAccountGate = featureGate(
  [AiFeatureEnum.FEATURE_MEMBERSHIP_PLAN],
  ['/settings/account/profile']
)
export const xpertMarketplaceSettingsGate = featureGate(
  [AiFeatureEnum.FEATURE_XPERT, AiFeatureEnum.FEATURE_XPERT_MARKETPLACE],
  ['/settings']
)

export const routes: Routes = [
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
            redirectTo: 'usage',
            pathMatch: 'full'
          },
          {
            path: 'usage',
            loadComponent: () => import('./account/usage.component').then((m) => m.PACAccountUsageComponent),
            canActivate: [membershipPlanAccountGate],
            data: {
              title: 'settings/account/usage',
              scopeContext: 'dual-scope'
            }
          },
          {
            path: 'billing',
            loadComponent: () => import('./account/billing.component').then((m) => m.PACAccountBillingComponent),
            canActivate: [membershipPlanAccountGate],
            data: {
              title: 'settings/account/billing',
              scopeContext: 'dual-scope'
            }
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
        path: 'membership',
        loadComponent: () => import('./membership/membership.component').then((m) => m.MembershipAdminComponent),
        canActivate: [NgxPermissionsGuard, membershipPlanSettingsGate],
        data: {
          title: 'settings/membership',
          scopeContext: 'dual-scope',
          permissions: {
            only: [AIPermissionsEnum.MEMBERSHIP_EDIT],
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
        path: 'xpert-access-requests',
        loadComponent: () =>
          import('./xpert-access-requests/xpert-access-requests.component').then(
            (m) => m.XpertAccessRequestsSettingsComponent
          ),
        canActivate: [NgxPermissionsGuard, xpertMarketplaceSettingsGate],
        data: {
          title: 'settings/xpert-access-requests',
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
        children: [
          {
            path: '',
            redirectTo: '/copilot',
            pathMatch: 'full'
          },
          {
            path: 'basic',
            redirectTo: '/copilot/basic',
            pathMatch: 'full'
          },
          {
            path: 'usages',
            redirectTo: '/copilot/usages',
            pathMatch: 'full'
          },
          {
            path: 'users',
            redirectTo: '/copilot/users',
            pathMatch: 'full'
          },
          {
            path: 'overview',
            redirectTo: '/copilot/overview',
            pathMatch: 'full'
          },
          {
            path: '**',
            redirectTo: '/copilot'
          }
        ],
        data: {
          title: 'copilot',
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
        redirectTo: '/plugins',
        pathMatch: 'full',
        data: {
          title: 'settings/plugins'
        }
      },
      {
        path: 'skill-repository',
        redirectTo: 'tenant/skills',
        pathMatch: 'full',
        data: {
          title: 'settings/skill-repository'
        }
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
