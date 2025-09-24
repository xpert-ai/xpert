import { Routes } from '@angular/router'
import { XpertStudioAPIToolComponent } from './tools'

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'w',
    pathMatch: 'full'
  },
  {
    path: 'w',
    loadChildren: () => import('./workspace/routes').then((x) => x.default),
    data: {
      title: 'Expert Workspace'
    }
  },
  {
    path: 'knowledges',
    loadChildren: () => import('./knowledge/routing').then((x) => x.default),
    data: {
      title: 'Knowledgebase'
    }
  },
  {
    path: 'tool/:id',
    component: XpertStudioAPIToolComponent
  },
  {
    path: 'x',
    loadChildren: () => import('./xpert/routes').then((x) => x.routes)
  }
  // {
  //   path: '**',
  //   component: XpertHomeComponent,
  // },
]
