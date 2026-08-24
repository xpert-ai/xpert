import { inject } from '@angular/core'
import { ActivatedRouteSnapshot, Router, Routes } from '@angular/router'
import { AppQuery, PersistQuery } from '@cloud/app/@core/state'
import { XpertWorkspaceAllComponent } from './all/all.component'
import { XpertWorkspaceApiToolsComponent } from './api-tools/tools.component'
import { XpertWorkspaceBuiltinToolsComponent } from './builtin-tools/tools.component'
import { XpertWorkspaceHomeComponent } from './home/home.component'
import { XpertWorkspaceKnowledgesComponent } from './knowledges/knowledges.component'
import { XpertWorkspaceKnowledgesPageComponent } from './knowledges/knowledges-page.component'
import { XpertWorkspaceMCPToolsComponent } from './mcp-tools/tools.component'
import { XpertWorkspaceXpertsComponent } from './xperts/xperts.component'
import { XpertWorkspaceDatabaseComponent } from './database/database.component'
import { ClawXpertWorkspaceSkillsPageComponent } from './skills/clawxpert-skills-page.component'
import { XpertWorkspaceSkillsComponent } from './skills/skills.component'
import { XpertWorkspacePromptWorkflowsComponent } from './prompt-workflows/workflows.component'
import { ClawXpertConnectorsComponent, XpertConnectorsComponent } from './connectors/connectors.component'
import { XpertWorkspaceFilesComponent } from './files/files.component'
import { XpertWorkspaceSettingsPageComponent } from './settings/settings-page.component'

function redirectToSelectedWorkspace(route: ActivatedRouteSnapshot) {
  const router = inject(Router)
  const appQuery = inject(AppQuery)
  const persistQuery = inject(PersistQuery)
  const workspaceId = appQuery.getValue().selectedWorkspace?.id ?? persistQuery.getValue().workspaceId

  const section = route.queryParamMap.get('section')
  const routeSegment =
    section === 'skills'
      ? 'clawxpert-skills'
      : section === 'knowledges'
        ? 'clawxpert-knowledges'
        : section === 'connectors'
          ? 'clawxpert-connectors'
          : section === 'files' || section === 'settings'
            ? section
            : null
  const target = routeSegment ? ['/xpert/w', workspaceId, routeSegment] : ['/xpert/w', workspaceId]

  return workspaceId ? router.createUrlTree(target) : true
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
        path: 'clawxpert-knowledges',
        component: XpertWorkspaceKnowledgesPageComponent
      },
      {
        path: 'files',
        component: XpertWorkspaceFilesComponent
      },
      {
        path: 'custom',
        component: XpertWorkspaceApiToolsComponent
      },
      {
        path: 'connectors',
        component: XpertConnectorsComponent
      },
      {
        path: 'clawxpert-connectors',
        component: ClawXpertConnectorsComponent
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
      },
      {
        path: 'clawxpert-skills',
        component: ClawXpertWorkspaceSkillsPageComponent
      },
      {
        path: 'settings',
        component: XpertWorkspaceSettingsPageComponent
      },
      {
        path: 'prompt-workflows',
        component: XpertWorkspacePromptWorkflowsComponent
      }
    ]
  }
] as Routes
