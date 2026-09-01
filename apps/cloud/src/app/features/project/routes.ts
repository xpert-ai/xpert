import { Routes } from '@angular/router'
import { XpertProjectAssetsComponent } from './project-assets.component'
import { XpertProjectConfigComponent } from './project-config.component'
import { XpertProjectListComponent } from './project-list.component'
import { XpertProjectOverviewComponent } from './project-overview.component'
import { XpertProjectPlanComponent } from './project-plan.component'
import { XpertProjectShellComponent } from './project-shell.component'
import { XpertProjectTasksComponent } from './project-tasks.component'
import { XpertProjectInvitationAcceptComponent } from './project-invitation-accept.component'

export const routes: Routes = [
  { path: '', component: XpertProjectListComponent, data: { title: 'Projects' } },
  {
    path: 'invitations/accept',
    component: XpertProjectInvitationAcceptComponent,
    data: { title: 'Project invitation' }
  },
  {
    path: ':id',
    component: XpertProjectShellComponent,
    data: { title: 'Project workspace' },
    children: [
      { path: '', component: XpertProjectOverviewComponent, pathMatch: 'full', data: { title: 'Project overview' } },
      { path: 'plan', component: XpertProjectPlanComponent, data: { title: 'Project plan' } },
      { path: 'tasks', component: XpertProjectTasksComponent, data: { title: 'Project conversations' } },
      { path: 'assets', component: XpertProjectAssetsComponent, data: { title: 'Project assets' } },
      { path: 'config', component: XpertProjectConfigComponent, data: { title: 'Project configuration' } }
    ]
  }
]
