import { inject } from '@angular/core'
import { Router, Routes } from '@angular/router'
import { NgxPermissionsGuard } from 'ngx-permissions'
import { map } from 'rxjs/operators'
import { AiFeatureEnum, AIPermissionsEnum, RequestScopeLevel, Store } from '../../../@core'
import { hydrateFeatureContext } from '../../feature-gate'
import { CopilotComponent } from './copilot.component'

export function copilotMonitoringGate() {
  const store = inject(Store)
  const router = inject(Router)

  return hydrateFeatureContext({ skipSessionCache: true }).pipe(
    map((hydrated) => {
      if (!hydrated) {
        return router.createUrlTree(['/copilot/basic'])
      }

      return store.activeScope.level === RequestScopeLevel.TENANT ||
        store.hasFeatureEnabled(AiFeatureEnum.FEATURE_COPILOT_MONITORING)
        ? true
        : router.createUrlTree(['/copilot/basic'])
    })
  )
}

export default [
  {
    path: '',
    component: CopilotComponent,
    canActivate: [NgxPermissionsGuard],
    data: {
      title: 'Model Providers',
      translationKey: 'AI Copilot',
      permissions: {
        only: [AIPermissionsEnum.COPILOT_EDIT],
        redirectTo: '/settings'
      }
    },
    children: [
      {
        path: '',
        redirectTo: 'basic',
        pathMatch: 'full'
      },
      {
        path: 'basic',
        loadComponent: () => import('./basic/basic.component').then((m) => m.CopilotBasicComponent)
      },
      {
        path: 'overview',
        canActivate: [copilotMonitoringGate],
        loadComponent: () => import('./overview/overview.component').then((m) => m.CopilotOverviewComponent)
      },
      {
        path: 'usage',
        canActivate: [copilotMonitoringGate],
        loadComponent: () => import('./usage-center/usage-center.component').then((m) => m.CopilotUsageCenterComponent)
      },
      {
        path: 'usages',
        redirectTo: 'usage',
        pathMatch: 'full'
      },
      {
        path: 'users',
        redirectTo: 'usage',
        pathMatch: 'full'
      }
    ]
  }
] as Routes
