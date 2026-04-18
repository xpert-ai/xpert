import { Routes } from '@angular/router'
import { NgxPermissionsGuard } from 'ngx-permissions'
import { AnalyticsPermissionsEnum } from '../../@core'

function redirectTo() {
  return '/chat'
}

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'project'
  },
  {
    path: 'project',
    loadChildren: () => import('../analytics-project/analytics-project.module').then((m) => m.AnalyticsProjectModule),
    canActivate: [NgxPermissionsGuard],
    data: {
      title: 'Project',
      permissions: {
        only: [AnalyticsPermissionsEnum.STORIES_EDIT],
        redirectTo
      }
    }
  },
  {
    path: 'models',
    loadChildren: () => import('../semantic-model/model.module').then((m) => m.SemanticModelModule),
    canActivate: [NgxPermissionsGuard],
    data: {
      title: 'Models',
      permissions: {
        only: [AnalyticsPermissionsEnum.MODELS_EDIT],
        redirectTo
      }
    }
  }
]
