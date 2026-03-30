import { inject, NgModule } from '@angular/core'
import { RouterModule, Routes } from '@angular/router'
import { NgxPermissionsGuard } from 'ngx-permissions'
import { AnalyticsPermissionsEnum, authGuard } from '../@core'
import { FeaturesComponent } from './features.component'
import { NotFoundComponent } from '../@shared/not-found'
import { AppService } from '../app.service'

export function redirectTo() {
  return '/chat'
}

const routes: Routes = [
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
        loadChildren: () => import('./chat/routes').then(m => m.routes),
        canActivate: [authGuard],
        data: {
          title: 'Chat',
          scopeContext: 'dual-scope'
        }
      },
      {
        path: 'explore',
        loadChildren: () => import('./xpert/explore/routes').then(m => m.routes),
        canActivate: [authGuard],
        data: {
          title: 'Explore Xperts',
          scopeContext: 'dual-scope'
        }
      },
      {
        path: 'xpert',
        loadChildren: () => import('./xpert/routes').then(m => m.routes),
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

      // BI Routers
      {
        path: 'dashboard',
        canActivate: [authGuard],
        data: {
          title: 'Dashboard',
          scopeContext: 'dual-scope',
          permissions: {
            only: [AnalyticsPermissionsEnum.STORIES_VIEW],
            redirectTo
          }
        },
        loadChildren: () => import('./home/home.module').then((m) => m.HomeModule)
      },
      {
        path: 'models',
        loadChildren: () => import('./semantic-model/model.module').then((m) => m.SemanticModelModule),
        canActivate: [authGuard, NgxPermissionsGuard],
        data: {
          title: 'Models',
          scopeContext: 'dual-scope',
          permissions: {
            only: [AnalyticsPermissionsEnum.MODELS_EDIT],
            redirectTo
          }
        }
      },
      {
        path: 'project',
        loadChildren: () => import('./project/project.module').then((m) => m.ProjectModule),
        canActivate: [authGuard, NgxPermissionsGuard],
        data: {
          title: 'Project',
          scopeContext: 'dual-scope',
          permissions: {
            only: [AnalyticsPermissionsEnum.STORIES_VIEW],
            redirectTo
          }
        }
      },
      {
        path: 'story',
        loadChildren: () => import('./story/story.module').then((m) => m.PACStoryModule),
        canActivate: [authGuard, NgxPermissionsGuard],
        data: {
          title: 'Story',
          scopeContext: 'dual-scope',
          permissions: {
            only: [AnalyticsPermissionsEnum.STORIES_VIEW],
            redirectTo
          }
        }
      },
      // {
      //   path: 'subscription',
      //   loadChildren: () => import('./subscription/subscription.module').then((m) => m.PACSubscriptionModule),
      //   canActivate: [authGuard]
      // },
      {
        path: 'indicator-app',
        loadChildren: () => import('@metad/cloud/indicator-market').then((m) => m.IndicatorMarketModule),
        canActivate: [authGuard],
        data: {
          title: 'Indicator-app',
          scopeContext: 'dual-scope',
          permissions: {
            only: [AnalyticsPermissionsEnum.INDICATOR_MARTKET_VIEW],
            redirectTo
          }
        }
      },
      {
        path: 'organization',
        loadChildren: () => import('./organization/organization.module').then((m) => m.OrganizationModule),
        data: {
          title: 'Organization',
          scopeContext: 'organization-only',
        }
      },
      {
        path: 'data',
        loadChildren: () => import('./data-factory/routes').then(m => m.routes),
        canActivate: [authGuard],
        data: {
          title: 'Data-Factory',
          scopeContext: 'dual-scope',
        }
      },
      // Settings Routers
      {
        path: 'settings',
        loadChildren: () => import('./setting/setting.module').then((m) => m.SettingModule),
        canActivate: [authGuard],
        data: {
          title: 'Settings',
          scopeContext: 'dual-scope',
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
