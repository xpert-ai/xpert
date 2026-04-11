import { inject } from '@angular/core'
import { Router, Routes } from '@angular/router'
import { AppQuery, PersistQuery } from '@xpert-ai/cloud/state'
import { XpertWorkspaceAllComponent } from './all/all.component'
import { XpertWorkspaceApiToolsComponent } from './api-tools/tools.component'
import { XpertWorkspaceBuiltinToolsComponent } from './builtin-tools/tools.component'
import { XpertWorkspaceHomeComponent } from './home/home.component'
import { XpertWorkspaceKnowledgesComponent } from './knowledges/knowledges.component'
import { XpertWorkspaceMCPToolsComponent } from './mcp-tools/tools.component'
import { XpertWorkspaceXpertsComponent } from './xperts/xperts.component'
import { XpertWorkspaceDatabaseComponent } from './database/database.component'
import { XpertWorkspaceSkillsComponent } from './skills/skills.component'

function redirectToSelectedWorkspace() {
  const router = inject(Router)
  const appQuery = inject(AppQuery)
  const persistQuery = inject(PersistQuery)
  const workspaceId = appQuery.getValue().selectedWorkspace?.id ?? persistQuery.getValue().workspaceId

  return workspaceId ? router.createUrlTree(['/xpert/w', workspaceId]) : true
}

export default [
  {
    path: '',
    component: XpertWorkspaceHomeComponent,
    canActivate: [redirectToSelectedWorkspace],
    data: {
      title: 'Expert Workspace',
      scopeContext: 'dual-scope'
    }
  },
  {
    path: ':id',
    component: XpertWorkspaceHomeComponent,
    data: {
      title: 'Expert Workspaces',
      scopeContext: 'dual-scope'
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
      },
      {
        path: 'mcp',
        component: XpertWorkspaceMCPToolsComponent
      },
      {
        path: 'database',
        component: XpertWorkspaceDatabaseComponent
      },
      {
        path: 'skills',
        component: XpertWorkspaceSkillsComponent
      }
    ]
  }
] as Routes
