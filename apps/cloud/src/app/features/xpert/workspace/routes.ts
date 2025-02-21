import { Routes } from '@angular/router'
import { XpertWorkspaceAllComponent } from './all/all.component'
import { XpertWorkspaceApiToolsComponent } from './api-tools/tools.component'
import { XpertWorkspaceBuiltinToolsComponent } from './builtin-tools/tools.component'
import { XpertWorkspaceHomeComponent } from './home/home.component'
import { XpertWorkspaceKnowledgesComponent } from './knowledges/knowledges.component'
import { XpertWorkspaceXpertsComponent } from './xperts/xperts.component'

export default [
  {
    path: '',
    component: XpertWorkspaceHomeComponent,
    data: {
      title: 'Expert Workspace'
    }
  },
  {
    path: ':id',
    component: XpertWorkspaceHomeComponent,
    data: {
      title: 'Expert Workspaces'
    },
    children: [
      {
        path: '',
        component: XpertWorkspaceAllComponent
      },
      {
        path: 'xperts',
        component: XpertWorkspaceXpertsComponent
      },
      {
        path: 'knowledges',
        component: XpertWorkspaceKnowledgesComponent
      },
      {
        path: 'custom',
        component: XpertWorkspaceApiToolsComponent
      },
      {
        path: 'builtin',
        component: XpertWorkspaceBuiltinToolsComponent
      }
    ]
  }
] as Routes
