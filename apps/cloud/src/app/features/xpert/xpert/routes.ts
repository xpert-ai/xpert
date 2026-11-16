import { MemoryLibraryComponent } from './memory/memory-library.component'
import { Routes } from '@angular/router'
import { XpertStudioComponent } from '../studio/studio.component'
import { XpertAuthorizationComponent } from './authorization/authorization.component'
import { XpertLogsComponent } from './logs/logs.component'
import { XpertMonitorComponent } from './monitor/monitor.component'
import { XpertComponent } from './xpert.component'

export const routes: Routes = [
  {
    path: ':id',
    component: XpertComponent,
    children: [
      {
        path: '',
        redirectTo: 'agents',
        pathMatch: 'full'
      },
      {
        path: 'agents',
        component: XpertStudioComponent
      },
      {
        path: 'auth',
        component: XpertAuthorizationComponent
      },
      // {
      //   path: 'develop',
      //   loadComponent: () => import('./develop/develop.component').then((x) => x.XpertDevelopComponent)
      // },
      {
        path: 'logs',
        component: XpertLogsComponent
      },
      {
        path: 'monitor',
        component: XpertMonitorComponent
      },
      {
        path: 'memory',
        component: MemoryLibraryComponent
      },
      {
        path: 'copilot',
        redirectTo: 'agents',
        pathMatch: 'full'
      }
    ]
  }
]
