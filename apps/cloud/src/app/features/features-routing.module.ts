import { NgModule } from '@angular/core'
import { RouterModule, Routes } from '@angular/router'
import { NgxPermissionsGuard } from 'ngx-permissions'
import { AnalyticsPermissionsEnum, AuthGuard } from '../@core'
import { FeaturesComponent } from './features.component'
import { NotFoundComponent } from '../@shared/not-found'

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
        canActivate: [AuthGuard],
        data: {
          title: 'Chat',
        }
      },
      {
        path: 'explore',
        loadChildren: () => import('./xpert/explore/routes').then(m => m.routes),
        canActivate: [AuthGuard],
        data: {
          title: 'Explore Xperts',
        }
      },
      {
        path: 'xpert',
        loadChildren: () => import('./xpert/routes').then(m => m.routes),
        canActivate: [AuthGuard],
        data: {
          title: 'Xpert Agent',
        }
      },

      // BI Routers
      {
        path: 'dashboard',
        canActivate: [AuthGuard],
        data: {
          title: 'Dashboard',
          permissions: {
            only: [AnalyticsPermissionsEnum.BUSINESS_AREA_EDIT],
            redirectTo
          }
        },
        loadChildren: () => import('./home/home.module').then((m) => m.HomeModule)
      },
      {
        path: 'models',
        loadChildren: () => import('./semantic-model/model.module').then((m) => m.SemanticModelModule),
        canActivate: [AuthGuard, NgxPermissionsGuard],
        data: {
          title: 'Models',
          permissions: {
            only: [AnalyticsPermissionsEnum.MODELS_EDIT],
            redirectTo
          }
        }
      },
      {
        path: 'project',
        loadChildren: () => import('./project/project.module').then((m) => m.ProjectModule),
        canActivate: [AuthGuard, NgxPermissionsGuard],
        data: {
          title: 'Project',
          permissions: {
            only: [AnalyticsPermissionsEnum.STORIES_VIEW],
            redirectTo
          }
        }
      },
      {
        path: 'story',
        loadChildren: () => import('./story/story.module').then((m) => m.PACStoryModule),
        canActivate: [AuthGuard, NgxPermissionsGuard],
        data: {
          title: 'Story',
          permissions: {
            only: [AnalyticsPermissionsEnum.STORIES_VIEW],
            redirectTo
          }
        }
      },
      {
        path: 'indicator',
        loadChildren: () => import('./indicator/indicator.module').then((m) => m.PACIndicatorModule),
        canActivate: [AuthGuard],
        data: {
          title: 'Indicator',
        }
      },
      // {
      //   path: 'subscription',
      //   loadChildren: () => import('./subscription/subscription.module').then((m) => m.PACSubscriptionModule),
      //   canActivate: [AuthGuard]
      // },
      {
        path: 'indicator-app',
        loadChildren: () => import('@metad/cloud/indicator-market').then((m) => m.IndicatorMarketModule),
        canActivate: [AuthGuard],
        data: {
          title: 'Indicator-app',
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
        }
      },
      {
        path: 'chatbi',
        loadChildren: () => import('./chatbi/routes').then(m => m.routes),
        canActivate: [AuthGuard],
        data: {
          title: 'Chat-BI',
        }
      },
      {
        path: 'data',
        loadChildren: () => import('./data-factory/routes').then(m => m.routes),
        canActivate: [AuthGuard],
        data: {
          title: 'Data-Factory',
        }
      },
      // Settings Routers
      {
        path: 'settings',
        loadChildren: () => import('./setting/setting.module').then((m) => m.SettingModule),
        canActivate: [AuthGuard],
        data: {
          title: 'Settings',
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
