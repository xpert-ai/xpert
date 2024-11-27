import { Routes } from '@angular/router'
import { XpertStudioComponent } from './studio/studio.component'
import { XpertStudioXpertsComponent } from './workspace/xperts/xperts.component'
import { XpertStudioAPIToolComponent } from './tools'
import { XpertDevelopComponent, XpertComponent } from './xpert'
import { XpertBasicComponent } from './xpert/basic/basic.component'
import { XpertLogsComponent } from './xpert/logs/logs.component'
import { XpertMonitorComponent } from './xpert/monitor/monitor.component'
import { XpertTemplatesComponent } from './templates/templates.component'
import { XpertWorkspaceWelcomeComponent } from './workspace/welcome/welcome.component'
import { XpertWorkspaceHomeComponent } from './workspace/home/home.component'
import { XpertAuthorizationComponent } from './xpert/authorization/authorization.component'
import { XpertCopilotComponent } from './xpert/copilot/copilot.component'
import { XpertCopilotKnowledgeNewBlankComponent } from './xpert/copilot/blank/blank.component'
import { XpertCopilotKnowledgeTestingComponent } from './xpert/copilot/testing/testing.component'

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
    component: XpertComponent,
    children: [
      {
        path: '',
        redirectTo: 'basic',
        pathMatch: 'full'
      },
      {
        path: 'basic',
        component: XpertBasicComponent
      },
      {
        path: 'agents',
        component: XpertStudioComponent
      },
      {
        path: 'auth',
        component: XpertAuthorizationComponent
      },
      {
        path: 'develop',
        component: XpertDevelopComponent
      },
      {
        path: 'logs',
        component: XpertLogsComponent
      },
      {
        path: 'monitor',
        component: XpertMonitorComponent
      },
      {
        path: 'copilot',
        component: XpertCopilotComponent,
        children: [
          {
            path: 'create',
            component: XpertCopilotKnowledgeNewBlankComponent
          },
          {
            path: 'testing',
            component: XpertCopilotKnowledgeTestingComponent
          },
          {
            path: ':id',
            component: XpertCopilotKnowledgeNewBlankComponent
          }
        ]
      },
    ]
  },
  // {
  //   path: '**',
  //   component: XpertHomeComponent,
  // },
]
