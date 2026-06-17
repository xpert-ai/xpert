import { Routes } from '@angular/router'
import { NgxPermissionsGuard } from 'ngx-permissions'
import { AiFeatureEnum, AIPermissionsEnum } from '../../../@core'
import { featureGate } from '../../feature-gate'
import { CopilotComponent } from './copilot.component'

export default [
  {
    path: '',
    component: CopilotComponent,
    canActivate: [NgxPermissionsGuard],
    data: {
      title: 'Settings / Copilot',
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
        path: 'usages',
        canActivate: [featureGate([AiFeatureEnum.FEATURE_COPILOT_MONITORING], ['/settings/copilot/basic'])],
        loadComponent: () => import('./usages/usages.component').then((m) => m.CopilotUsagesComponent)
      },
      {
        path: 'users',
        canActivate: [featureGate([AiFeatureEnum.FEATURE_COPILOT_MONITORING], ['/settings/copilot/basic'])],
        loadComponent: () => import('./users/users.component').then((m) => m.CopilotUsersComponent)
      },
      {
        path: 'overview',
        canActivate: [featureGate([AiFeatureEnum.FEATURE_COPILOT_MONITORING], ['/settings/copilot/basic'])],
        loadComponent: () => import('./overview/overview.component').then((m) => m.CopilotOverviewComponent)
      }
    ]
  }
] as Routes
