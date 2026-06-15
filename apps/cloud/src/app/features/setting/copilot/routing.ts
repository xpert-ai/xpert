import { Routes } from '@angular/router'
import { NgxPermissionsGuard } from 'ngx-permissions'
import { AIPermissionsEnum } from '../../../@core'
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
        loadComponent: () => import('./usages/usages.component').then((m) => m.CopilotUsagesComponent)
      },
      {
        path: 'users',
        loadComponent: () => import('./users/users.component').then((m) => m.CopilotUsersComponent)
      },
      {
        path: 'overview',
        loadComponent: () => import('./overview/overview.component').then((m) => m.CopilotOverviewComponent)
      }
    ]
  }
] as Routes
