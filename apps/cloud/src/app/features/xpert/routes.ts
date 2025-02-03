import { Routes } from '@angular/router'
import { XpertStudioAPIToolComponent } from './tools'
import { XpertWorkspaceHomeComponent } from './workspace/home/home.component'
import { XpertWorkspaceWelcomeComponent } from './workspace/welcome/welcome.component'
import { XpertStudioXpertsComponent } from './workspace/xperts/xperts.component'

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'w',
    pathMatch: 'full'
  },
  {
    path: 'w',
    component: XpertWorkspaceHomeComponent,
    data: {
      title: 'Expert Workspaces',
    },
    children: [
      {
        path: '',
        component: XpertWorkspaceWelcomeComponent
      },
      {
        path: ':id',
        component: XpertStudioXpertsComponent
      }
      // {
      //   path: 'tools',
      //   component: XpertStudioToolsComponent
      // }
    ]
  },
  {
    path: 'tool/:id',
    component: XpertStudioAPIToolComponent
  },
  {
    path: ':id',
    loadChildren: () => import('./xpert/routes').then((x) => x.routes)
  }
  // {
  //   path: '**',
  //   component: XpertHomeComponent,
  // },
]
