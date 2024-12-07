import { Routes } from '@angular/router'
import { XpertStudioXpertsComponent } from './workspace/xperts/xperts.component'
import { XpertStudioAPIToolComponent } from './tools'
import { XpertTemplatesComponent } from './templates/templates.component'
import { XpertWorkspaceWelcomeComponent } from './workspace/welcome/welcome.component'
import { XpertWorkspaceHomeComponent } from './workspace/home/home.component'

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'w',
    pathMatch: 'full'
  },
  {
    path: 'w',
    component: XpertWorkspaceHomeComponent,
    children: [
      {
        path: '',
        component: XpertWorkspaceWelcomeComponent
      },
      {
        path: ':id',
        component: XpertStudioXpertsComponent
      },
      // {
      //   path: 'tools',
      //   component: XpertStudioToolsComponent
      // }
    ]
  },
  {
    path: 'e',
    component: XpertTemplatesComponent
  },
  {
    path: 'tool/:id',
    component: XpertStudioAPIToolComponent,
  },
  {
    path: ':id',
    loadChildren: () => import('./xpert/routes').then((x) => x.routes)
  },
  // {
  //   path: '**',
  //   component: XpertHomeComponent,
  // },
]
