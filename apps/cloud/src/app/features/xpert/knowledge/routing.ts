import { Routes } from '@angular/router'
import { NgxPermissionsGuard } from 'ngx-permissions'
import { AIPermissionsEnum, PermissionsEnum } from '../../../@core'
import { KnowledgebaseHomeComponent } from './home.component'

export default [
  {
    path: '',
    component: KnowledgebaseHomeComponent,
    canActivate: [NgxPermissionsGuard],
    data: {
      title: 'Settings / Knowledgebase Home',
      permissions: {
        only: [AIPermissionsEnum.KNOWLEDGEBASE_EDIT],
        redirectTo: '/settings'
      }
    },
    children: []
  },
  {
    path: ':id',
    loadChildren: () => import('./knowledgebase/routing').then((m) => m.default)
  }
] as Routes
