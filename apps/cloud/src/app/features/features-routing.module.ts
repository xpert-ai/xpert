import { inject, NgModule } from '@angular/core'
import { RouterModule, Routes } from '@angular/router'
import { NgxPermissionsGuard } from 'ngx-permissions'
import { AiFeatureEnum, AIPermissionsEnum, RolesEnum, authGuard } from '../@core'
import { FeaturesComponent } from './features.component'
import { NotFoundComponent } from '../@shared/not-found'
import { AppService } from '../app.service'
import { featureGate } from './feature-gate'

export function redirectTo() {
  return '/chat'
}

export const xpertMarketplaceRouteGate = featureGate(
  [AiFeatureEnum.FEATURE_XPERT, AiFeatureEnum.FEATURE_XPERT_MARKETPLACE],
  ['/explore']
)

export const xpertProjectRouteGate = featureGate(
  [AiFeatureEnum.FEATURE_XPERT, AiFeatureEnum.FEATURE_XPERT_PROJECT],
  ['/chat']
)

export const routes: Routes = [
  {
    path: '',
    component: FeaturesComponent,
    children: [
      {
        path: '',
        redirectTo: 'chat',
        pathMatch: 'full'
      },
      // Xpert Routers
      {
        path: 'chat',
        loadChildren: () => import('./chat/routes').then((m) => m.routes),
        canActivate: [authGuard],
        data: {
          title: 'Chat',
          scopeContext: 'dual-scope'
        }
      },
      {
        path: 'project',
        loadChildren: () => import('./project/routes').then((m) => m.routes),
        canActivate: [authGuard, NgxPermissionsGuard, xpertProjectRouteGate],
        data: {
          title: 'Project',
          scopeContext: 'dual-scope',
          permissions: {
            only: [AIPermissionsEnum.XPERT_PROJECT_VIEW],
            redirectTo
          }
        }
      },
      {
        path: 'explore',
        loadChildren: () => import('./explore/routes').then((m) => m.routes),
        canActivate: [authGuard],
        data: {
          title: 'Explore Xperts',
          scopeContext: 'dual-scope'
        }
      },
      {
        path: 'xpert',
        loadChildren: () => import('./xpert/routes').then((m) => m.routes),
        canActivate: [
          authGuard,
          () => {
            const appService = inject(AppService)
            appService.inWorkspace.set(true)
          }
        ],
        canDeactivate: [
          () => {
            const appService = inject(AppService)
            appService.inWorkspace.set(false)
          }
        ],
        data: {
          title: 'Xpert Agent',
          scopeContext: 'dual-scope'
        }
      },
      {
        path: 'agent-evolution',
        loadChildren: () => import('./agent-evolution/routes').then((m) => m.routes),
        canActivate: [authGuard, NgxPermissionsGuard],
        data: {
          title: 'Agent Evolution',
          scopeContext: 'dual-scope',
          permissions: {
            only: [AIPermissionsEnum.EVOLUTION_VIEW, AIPermissionsEnum.XPERT_EDIT],
            redirectTo
          }
        }
      },
      {
        path: 'plugins/marketplace/:scope/:packageName',
        loadComponent: () =>
          import('./setting/plugins/marketplace/marketplace-readme-page.component').then(
            (m) => m.PluginMarketplaceReadmePageComponent
          ),
        canActivate: [authGuard, NgxPermissionsGuard],
        data: {
          title: 'Plugin Details',
          scopeContext: 'dual-scope',
          permissions: {
            only: [AIPermissionsEnum.XPERT_EDIT],
            redirectTo
          }
        }
      },
      {
        path: 'plugins/marketplace/:packageName',
        loadComponent: () =>
          import('./setting/plugins/marketplace/marketplace-readme-page.component').then(
            (m) => m.PluginMarketplaceReadmePageComponent
          ),
        canActivate: [authGuard, NgxPermissionsGuard],
        data: {
          title: 'Plugin Details',
          scopeContext: 'dual-scope',
          permissions: {
            only: [AIPermissionsEnum.XPERT_EDIT],
            redirectTo
          }
        }
      },
      {
        path: 'plugins',
        loadComponent: () => import('./setting/plugins/plugins.component').then((m) => m.PluginsComponent),
        canActivate: [authGuard, NgxPermissionsGuard],
        data: {
          title: 'Plugins',
          scopeContext: 'dual-scope',
          permissions: {
            only: [AIPermissionsEnum.XPERT_EDIT],
            redirectTo
          }
        }
      },
      {
        path: 'operations',
        loadComponent: () => import('./operations/mcp-management.component').then((m) => m.McpManagementComponent),
        canActivate: [authGuard, NgxPermissionsGuard],
        data: {
          title: 'MCP Management',
          scopeContext: 'dual-scope',
          permissions: {
            only: [RolesEnum.SUPER_ADMIN],
            redirectTo
          }
        }
      },
      {
        path: 'xpert-access-requests',
        loadComponent: () =>
          import('./xpert-access-requests/xpert-access-requests.component').then((m) => m.XpertAccessRequestsComponent),
        canActivate: [authGuard, NgxPermissionsGuard, xpertMarketplaceRouteGate],
        data: {
          title: 'Xpert Access Requests',
          scopeContext: 'organization-only',
          permissions: {
            only: [RolesEnum.AI_BUILDER, RolesEnum.ADMIN, RolesEnum.SUPER_ADMIN],
            redirectTo
          }
        }
      },
      {
        path: 'copilot',
        loadChildren: () => import('./setting/copilot/routing').then((m) => m.default),
        canActivate: [authGuard],
        data: {
          title: 'Model Providers',
          scopeContext: 'dual-scope'
        }
      },
      {
        path: 'organization',
        loadChildren: () => import('./organization/organization.module').then((m) => m.OrganizationModule),
        data: {
          title: 'Organization',
          scopeContext: 'organization-only'
        }
      },
      // Settings Routers
      {
        path: 'settings',
        loadChildren: () => import('./setting/setting.module').then((m) => m.SettingModule),
        canActivate: [authGuard],
        data: {
          title: 'Settings',
          scopeContext: 'dual-scope'
        }
      },
      {
        path: '404',
        component: NotFoundComponent
      }
    ]
  }
]

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class FeaturesRoutingModule {}
