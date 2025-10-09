import { Routes } from '@angular/router'
import { NgxPermissionsGuard } from 'ngx-permissions'
import { AIPermissionsEnum } from '../../../@core'
import { XpertConnectKnowledgeComponent } from './connect/connect.component'
import { KnowledgebaseHomeComponent } from './home.component'
import { KnowledgePipelinesComponent } from './pipelines/pipelines.component'

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
    path: 'connect',
    component: XpertConnectKnowledgeComponent,
    data: {
      title: 'Settings / Knowledgebase Connect',
      permissions: {
        only: [AIPermissionsEnum.KNOWLEDGEBASE_EDIT],
        redirectTo: '/settings'
      }
    }
  },
  {
    path: 'create-from-pipeline',
    component: KnowledgePipelinesComponent,
    data: {
      title: 'Settings / Knowledgebase Create from Pipeline',
      permissions: {
        only: [AIPermissionsEnum.KNOWLEDGEBASE_EDIT],
        redirectTo: '/settings'
      }
    }
  },
  {
    path: ':id',
    loadChildren: () => import('./knowledgebase/routing').then((m) => m.default)
  }
] as Routes
